// U4 — the AI tools layer (the deterministic capability surface).
//
// `makeTools(userId, caseId)` returns the model-callable tool map wired into the chat route's
// `streamText` call. The orchestration contract:
//
//   - EVERY tool's `execute` opens its own `withUser(userId, tx => …)` — each tool call is its
//     own RLS-scoped transaction (so a partial multi-step turn leaves each committed write
//     coherent, and a forgotten WHERE is structurally harmless under RLS).
//   - Every tool operates on the active `caseId` (re-validated as owned by the route before the
//     tools run; the tools never accept a caseId from the model).
//   - Tool results are SMALL + STRUCTURED. A caught error returns `{ error: '…' }` (the
//     conversation continues) rather than throwing — except where the SDK should retry input
//     (Zod validation handles that before execute runs).
//   - `generateArtifact` + `scheduleReminder` are the two world-effecting tools — `needsApproval`
//     so the UI confirms before they run (injection defense + agent/user parity).
//
// VERIFIED AI SDK v6 (ai@6.0.209) against the installed types:
//   - `tool({ description, inputSchema, execute, needsApproval })` — needsApproval is
//     `boolean | (input) => boolean | Promise<boolean>` (provider-utils ToolNeedsApprovalFunction).
//   - `tool` + `zodSchema` re-exported from 'ai' (→ @ai-sdk/provider-utils).
import { tool } from 'ai'
import { z } from 'zod'
import { withUser } from '@/lib/db'
import {
  loadCaseContext,
  setCaseStatus,
  type CaseStatus,
} from '@/lib/db/cases'
import { cases } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  linkDocument,
  relinkDocument,
  setDocumentKind,
  DOCUMENT_KINDS,
} from '@/lib/db/documents'
import { updateProfile } from '@/lib/db/profile'
import { generateArtifactDraft, type ArtifactType } from '@/lib/artifacts/generate'
import { createArtifact, markArtifactSent } from '@/lib/db/artifacts'
import {
  createDeadline,
  updateDeadline,
  cancelDeadline,
  getDeadline,
  listDeadlines,
} from '@/lib/db/deadlines'
import { startReminder, closeReminder } from '@/lib/workflows/reminder-control'
import { generateShareCard } from '@/lib/share/card'
import { recordCaseAggregate } from '@/lib/db/aggregate'
import { getRecipientEmail } from '@/lib/auth'

const ARTIFACT_TYPES = ['dispute', 'appeal', 'complaint', 'call_script'] as const
const CASE_STATUSES = [
  'new',
  'gathering',
  'recommendation_offered',
  'acting',
  'resolved',
  'closed',
  'reopened',
] as const

// A short, structured error a tool returns instead of throwing (the conversation continues).
function toolError(message: string): { error: string } {
  return { error: message }
}

/**
 * Build the model-callable tool map for one user + their active case.
 *
 * Note on input validation: each tool's Zod `inputSchema` is the source of truth the SDK sends
 * to the model and validates against, so a shape error never reaches `execute` (the SDK rejects
 * or retries it). Semantic failures (e.g. "deadline not found", a bad date) are caught here and
 * returned as a structured `{ error }` so the conversation continues rather than throwing.
 */
export function makeTools(userId: string, caseId: string) {
  return {
    // ---- Case-level edits ------------------------------------------------
    updateCaseTitle: tool({
      description:
        'Set a short, human-readable title for the active case (e.g. "ER visit balance bill — Anthem denial"). Use once you know what the case is about, so the user sees a meaningful name.',
      inputSchema: z.object({
        title: z.string().min(1).max(120).describe('A short case title.'),
      }),
      execute: async ({ title }) => {
        try {
          return await withUser(userId, async (tx) => {
            await tx
              .update(cases)
              .set({ title, updatedAt: new Date() })
              .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
            return { ok: true, title }
          })
        } catch {
          return toolError('Could not update the case title.')
        }
      },
    }),

    setCaseStatus: tool({
      description:
        'Advance the active case to a lifecycle status: new → gathering → recommendation_offered → acting → resolved (or closed/reopened). Advisory only; it never gates other actions. Prefer markResolved/reopenCase for the terminal transitions.',
      inputSchema: z.object({
        status: z.enum(CASE_STATUSES).describe('The new case status.'),
      }),
      execute: async ({ status }) => {
        try {
          return await withUser(userId, async (tx) => {
            await setCaseStatus(tx, caseId, status as CaseStatus)
            return { ok: true, status }
          })
        } catch {
          return toolError('Could not update the case status.')
        }
      },
    }),

    // ---- Profile (ask-once / reuse, field-level merge) -------------------
    updateProfile: tool({
      description:
        "Record the user's coverage situation as you learn it, so you never have to re-ask. Field-level merge — pass only the fields you newly learned. coverageSituation routes the playbook (uninsured / commercial-in-network / commercial-OON / Medicare-FFS / Medicare-Advantage / Medicaid / dual-QMB / ACA-marketplace / two-plan-COB). isDualQmb (QMB → patient owes $0) and isSelfFunded (ERISA vs state-DOI venue) flip the whole playbook. Put any non-routing fact (veteran, income, charity-eligibility, plan/employer name) into situationNotes.",
      inputSchema: z.object({
        coverageSituation: z
          .string()
          .nullable()
          .optional()
          .describe('The routing coverage key, or null to clear.'),
        isDualQmb: z
          .boolean()
          .optional()
          .describe('True if the user is dual-eligible / QMB (balance billing prohibited).'),
        isSelfFunded: z
          .boolean()
          .nullable()
          .optional()
          .describe('True=self-funded (ERISA), false=fully-insured (state DOI), null=unknown.'),
        state: z.string().nullable().optional().describe('US state (2-letter or name), or null.'),
        situationNotes: z
          .string()
          .nullable()
          .optional()
          .describe('Free-text notes for non-routing facts; merged, not replaced wholesale.'),
      }),
      execute: async (patch) => {
        try {
          return await withUser(userId, async (tx) => {
            const row = await updateProfile(tx, userId, patch)
            return {
              ok: true,
              profile: {
                coverageSituation: row.coverageSituation,
                isDualQmb: row.isDualQmb,
                isSelfFunded: row.isSelfFunded,
                state: row.state,
              },
            }
          })
        } catch {
          return toolError('Could not save the profile.')
        }
      },
    }),

    // ---- Documents (U3) --------------------------------------------------
    linkDocument: tool({
      description:
        'Link one document to another it belongs with — typically an EOB to the bill it explains. Both must already be on the case. Survives out-of-order uploads.',
      inputSchema: z.object({
        docId: z.string().describe('The document being linked (e.g. the EOB).'),
        targetDocId: z.string().describe('The document it links to (e.g. the bill).'),
      }),
      execute: async ({ docId, targetDocId }) => {
        try {
          return await withUser(userId, async (tx) => {
            const row = await linkDocument(tx, userId, { docId, targetDocId })
            return { ok: true, docId: row.id, linkedToDocId: row.linkedToDocId }
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not link the documents.')
        }
      },
    }),

    relinkDocument: tool({
      description:
        "Change or clear a document's link. Pass targetDocId: null to unlink it. Use to correct a wrong or no-longer-needed link.",
      inputSchema: z.object({
        docId: z.string().describe('The document whose link to change.'),
        targetDocId: z
          .string()
          .nullable()
          .describe('The new link target, or null to clear the link.'),
      }),
      execute: async ({ docId, targetDocId }) => {
        try {
          return await withUser(userId, async (tx) => {
            const row = await relinkDocument(tx, userId, { docId, targetDocId })
            return { ok: true, docId: row.id, linkedToDocId: row.linkedToDocId }
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not change the link.')
        }
      },
    }),

    setDocumentKind: tool({
      description: `Classify a document so the case tracks it correctly. Kinds: ${DOCUMENT_KINDS.join(', ')}.`,
      inputSchema: z.object({
        docId: z.string().describe('The document to classify.'),
        kind: z.enum(DOCUMENT_KINDS).describe('The document kind.'),
      }),
      execute: async ({ docId, kind }) => {
        try {
          return await withUser(userId, async (tx) => {
            const row = await setDocumentKind(tx, userId, docId, kind)
            return { ok: true, docId: row.id, kind: row.kind }
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not classify the document.')
        }
      },
    }),

    // ---- Artifact (WORLD-EFFECTING → needsApproval) ----------------------
    generateArtifact: tool({
      description:
        "Draft the REAL, ready-to-send document the user needs — a dispute letter, insurance appeal, regulator complaint, or phone call-script — personalized from the case profile. The draft is staged for the user to review/approve before it's saved. Prefer drafting the artifact over telling the user to write it themselves.",
      inputSchema: z.object({
        type: z.enum(ARTIFACT_TYPES).describe('Which document to draft.'),
      }),
      // World-effecting: always confirm in v1 (the approval card IS the human review step).
      needsApproval: true,
      execute: async ({ type }) => {
        try {
          // The model call (generateArtifactDraft) runs OUTSIDE the tx so the transaction is
          // short; the DB write (createArtifact) is its own RLS-scoped tx.
          const caseContext = await withUser(userId, (tx) =>
            loadCaseContext(tx, userId, caseId),
          )
          const draft = await generateArtifactDraft({
            type: type as ArtifactType,
            caseContext,
          })
          const row = await withUser(userId, (tx) =>
            createArtifact(tx, userId, {
              caseId,
              type: type as ArtifactType,
              title: draft.title,
              contentMd: draft.contentMd,
            }),
          )
          return {
            ok: true,
            artifactId: row.id,
            title: row.title,
            type: row.type,
            contentMd: row.contentMd,
          }
        } catch {
          return toolError('Could not draft the document.')
        }
      },
    }),

    markArtifactSent: tool({
      description:
        'Mark a drafted artifact as sent once the user has sent it. Records it on the timeline so the smart reminder knows the user already acted.',
      inputSchema: z.object({
        artifactId: z.string().describe('The artifact that was sent.'),
      }),
      execute: async ({ artifactId }) => {
        try {
          return await withUser(userId, async (tx) => {
            const row = await markArtifactSent(tx, userId, artifactId)
            return { ok: true, artifactId: row.id, status: row.status }
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not mark the artifact sent.')
        }
      },
    }),

    // ---- Reminder / deadline (scheduleReminder is WORLD-EFFECTING) -------
    scheduleReminder: tool({
      description:
        "Schedule a smart reminder for an important deadline (e.g. an appeal-filing deadline). billcheck emails the user shortly before the deadline and tailors/suppresses the nudge based on the live case state. Pass dueAt as an ISO date/time string. Staged for the user to approve before it's set.",
      inputSchema: z.object({
        dueAt: z
          .string()
          .describe('The deadline as an ISO 8601 date or date-time string (e.g. 2026-03-14).'),
        kind: z
          .string()
          .optional()
          .describe('A short kind/category for the deadline (e.g. "appeal", "dispute").'),
        title: z
          .string()
          .optional()
          .describe('A short human title for the deadline.'),
      }),
      // World-effecting (sends email at the deadline): always confirm in v1.
      needsApproval: true,
      execute: async ({ dueAt, kind, title }) => {
        const parsed = new Date(dueAt)
        if (Number.isNaN(parsed.getTime())) {
          return toolError(`Could not understand the deadline date "${dueAt}".`)
        }
        try {
          // 1) Create the deadline under RLS (dedup on kind+dueAt so a re-ask is idempotent).
          const deadline = await withUser(userId, (tx) =>
            createDeadline(tx, userId, {
              caseId,
              kind,
              title,
              dueAt: parsed,
              dedupKey: `${kind ?? 'deadline'}:${parsed.toISOString()}`,
            }),
          )

          // 2) Arm the durable reminder. The recipient email comes from the auth claims; if it's
          //    unavailable we still keep the deadline tracked and report that the email couldn't arm.
          const recipientEmail = await getRecipientEmail()
          if (!recipientEmail) {
            return {
              ok: true,
              deadlineId: deadline.id,
              dueAt: parsed.toISOString(),
              reminderArmed: false,
              note: "Deadline saved, but I couldn't arm the email reminder (no email on file).",
            }
          }

          try {
            await startReminder({
              caseId,
              deadlineId: deadline.id,
              userId,
              dueAtISO: parsed.toISOString(),
              recipientEmail,
            })
          } catch {
            // Deadline is tracked; the workflow just didn't arm — don't fail the whole tool.
            return {
              ok: true,
              deadlineId: deadline.id,
              dueAt: parsed.toISOString(),
              reminderArmed: false,
              note: "Deadline saved, but the email reminder couldn't be armed right now.",
            }
          }

          return {
            ok: true,
            deadlineId: deadline.id,
            dueAt: parsed.toISOString(),
            reminderArmed: true,
          }
        } catch {
          return toolError('Could not schedule the reminder.')
        }
      },
    }),

    updateDeadline: tool({
      description:
        'Change a tracked deadline (reschedule the date, rename it, or re-classify). Reschedules the same logical reminder.',
      inputSchema: z.object({
        deadlineId: z.string().describe('The deadline to update.'),
        dueAt: z
          .string()
          .optional()
          .describe('A new ISO 8601 due date, if rescheduling.'),
        kind: z.string().nullable().optional().describe('A new kind, or null to clear.'),
        title: z.string().nullable().optional().describe('A new title, or null to clear.'),
      }),
      execute: async ({ deadlineId, dueAt, kind, title }) => {
        const patch: { dueAt?: Date; kind?: string | null; title?: string | null } = {}
        if (dueAt !== undefined) {
          const parsed = new Date(dueAt)
          if (Number.isNaN(parsed.getTime())) {
            return toolError(`Could not understand the deadline date "${dueAt}".`)
          }
          patch.dueAt = parsed
        }
        if (kind !== undefined) patch.kind = kind
        if (title !== undefined) patch.title = title
        try {
          return await withUser(userId, async (tx) => {
            const row = await updateDeadline(tx, userId, deadlineId, patch)
            return {
              ok: true,
              deadlineId: row.id,
              dueAt: row.dueAt.toISOString(),
              title: row.title,
              kind: row.kind,
            }
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not update the deadline.')
        }
      },
    }),

    cancelDeadline: tool({
      description:
        'Cancel a tracked deadline and its reminder — e.g. when it no longer applies. The smart reminder is cancelled too.',
      inputSchema: z.object({
        deadlineId: z.string().describe('The deadline to cancel.'),
      }),
      execute: async ({ deadlineId }) => {
        try {
          const result = await withUser(userId, async (tx) => {
            const before = await getDeadline(tx, userId, deadlineId)
            const row = await cancelDeadline(tx, userId, deadlineId)
            return { row, workflowRunId: before?.workflowRunId ?? null }
          })
          // Cancel the live workflow OUTSIDE the tx (best-effort, never throws into the caller).
          await closeReminder(caseId, deadlineId, result.workflowRunId)
          return { ok: true, deadlineId: result.row.id, status: result.row.status }
        } catch (e) {
          return toolError(e instanceof Error ? e.message : 'Could not cancel the deadline.')
        }
      },
    }),

    // ---- Conclusion ------------------------------------------------------
    markResolved: tool({
      description:
        "Mark the active case resolved — the user's matter is wrapped up. This closes any open reminders and (only if the user opted in to anonymized data sharing) records a de-identified aggregate record. Reversible via reopenCase.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          // 1) Set status + collect open deadlines to close (one RLS-scoped tx).
          const openDeadlines = await withUser(userId, async (tx) => {
            await setCaseStatus(tx, caseId, 'resolved')
            const all = await listDeadlines(tx, userId, caseId)
            return all.filter((d) => d.status === 'open')
          })

          // 2) Close each open reminder (best-effort, outside the tx).
          for (const d of openDeadlines) {
            await closeReminder(caseId, d.id, d.workflowRunId)
          }

          // 3) Deterministic, consent-gated aggregate write (self-checks consent — admin client).
          const agg = await recordCaseAggregate(caseId, userId)

          return { ok: true, status: 'resolved', aggregateRecorded: agg.written }
        } catch {
          return toolError('Could not mark the case resolved.')
        }
      },
    }),

    reopenCase: tool({
      description:
        'Re-open a previously resolved/closed case (the inverse of markResolved) when new developments arise.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await withUser(userId, async (tx) => {
            await setCaseStatus(tx, caseId, 'reopened')
            return { ok: true, status: 'reopened' }
          })
        } catch {
          return toolError('Could not re-open the case.')
        }
      },
    }),

    // ---- Share card (previewed, never auto-shared) -----------------------
    generateShareCard: tool({
      description:
        "Draft a short, fully-anonymized share card telling the story of this medical bill — what happened and what the user did. The user previews and edits it before they ever share it; nothing is posted automatically. Available at any time.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const caseContext = await withUser(userId, (tx) =>
            loadCaseContext(tx, userId, caseId),
          )
          const card = await generateShareCard(caseContext)
          return { ok: true, title: card.title, bodyMd: card.bodyMd }
        } catch {
          return toolError('Could not draft the share card.')
        }
      },
    }),
  }
}

export type BillcheckTools = ReturnType<typeof makeTools>
