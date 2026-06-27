// Render the per-turn structured-state block that seeds the system prompt.
// Pure function over loadCaseContext's output — no DB access here.
// The 3-part prompt is assembled as: SYSTEM_PROMPT + TOOL_NOTE + buildStateBlock(ctx).
import type { CaseContext, OtherCaseSummary } from '@/lib/db/cases'

// U4 orchestration note — when to use the tools as a SET + the propose-vs-confirm posture.
// Deliberately does NOT restate each tool: the SDK sends every tool's own description +
// schema to the model automatically, so per-tool detail lives there (single source of truth).
export const TOOL_NOTE = `You have tools that let you ACT on the user's behalf — not just advise. Prefer doing the work through a tool over telling the user to do it themselves: record what you learn about their situation, classify and link their documents, draft the actual letter or call-script, track deadlines with a smart reminder, mark things sent, and produce a shareable summary. Keep the case state (above) accurate as you go, and never re-ask for something already recorded there.

Two tools change the outside world and are always confirmed by the user first: drafting an artifact and scheduling a reminder. Propose them naturally — the user gets a confirmation card and approves or edits before anything is saved or sent. Everything else you may do directly when it helps. If a tool returns an error, acknowledge it plainly and continue; never expose raw tool output to the user.`

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'unknown'
  return d.toISOString().slice(0, 10)
}

/**
 * Render the gathered case context into a compact, labeled plain-text block.
 * Sections: CASE STATUS, CASE SUMMARY, KNOWN PROFILE/SITUATION, OPEN ARTIFACTS,
 * OPEN DEADLINES, DOCUMENTS ON FILE, and (U11) optionally YOUR OTHER OPEN CASES.
 * Kept terse to stay cache-friendly and cheap.
 *
 * `otherCases` (U11) is title/status ONLY — never another case's contents. It exists so the
 * model knows other cases exist (and binds every action to the ACTIVE case above) without
 * conflating them. The tools all close over the active caseId, so this is purely awareness.
 */
export function buildStateBlock(
  ctx: CaseContext,
  otherCases?: OtherCaseSummary[],
  now: Date = new Date(),
): string {
  const lines: string[] = []

  lines.push('--- CASE STATE (system-maintained; do not re-ask what is already known) ---')

  // Give the model the current date so relative deadlines ("in 2 weeks") resolve correctly —
  // it otherwise has no reliable sense of "today" and will guess a wrong/past date.
  lines.push(`TODAY'S DATE: ${now.toISOString().slice(0, 10)}`)

  lines.push(`CASE STATUS: ${ctx.status}`)

  lines.push('CASE SUMMARY:')
  lines.push(ctx.summary?.trim() ? ctx.summary.trim() : '(none yet — this is early in the case)')

  lines.push('KNOWN PROFILE/SITUATION:')
  const p = ctx.profile
  if (!p) {
    lines.push('(nothing recorded yet)')
  } else {
    const facts: string[] = []
    if (p.coverageSituation) facts.push(`coverage: ${p.coverageSituation}`)
    if (p.isDualQmb) facts.push('dual-eligible / QMB (Medicare+Medicaid → balance billing prohibited; patient owes $0)')
    if (p.isSelfFunded === true) facts.push('plan is self-funded (ERISA venue)')
    if (p.isSelfFunded === false) facts.push('plan is fully-insured (state-DOI venue)')
    if (p.state) facts.push(`state: ${p.state}`)
    if (p.situationNotes?.trim()) facts.push(`notes: ${p.situationNotes.trim()}`)
    lines.push(facts.length ? facts.map((f) => `- ${f}`).join('\n') : '(nothing recorded yet)')
  }

  lines.push('OPEN ARTIFACTS:')
  if (ctx.openArtifacts.length === 0) {
    lines.push('(none)')
  } else {
    for (const a of ctx.openArtifacts) {
      lines.push(`- ${a.title ?? a.type ?? 'artifact'} [${a.type ?? 'unknown'}] (status: ${a.status})`)
    }
  }

  lines.push('OPEN DEADLINES:')
  if (ctx.openDeadlines.length === 0) {
    lines.push('(none)')
  } else {
    for (const d of ctx.openDeadlines) {
      lines.push(`- ${d.title ?? d.kind ?? 'deadline'} — due ${fmtDate(d.dueAt)} (status: ${d.status})`)
    }
  }

  lines.push('DOCUMENTS ON FILE:')
  if (ctx.documents.length === 0) {
    lines.push('(none uploaded yet)')
  } else {
    for (const doc of ctx.documents) {
      const linked = doc.linkedToDocId ? ' [linked]' : ''
      lines.push(`- ${doc.filename ?? 'document'} [${doc.kind}] (status: ${doc.status})${linked}`)
    }
  }

  // U11 — light cross-case awareness: titles + status of the user's OTHER open cases ONLY.
  // Explicitly NOT their contents. Every tool binds the ACTIVE case above; this is so the model
  // doesn't mistake another case's bill for this one (or re-open a separate matter here).
  if (otherCases && otherCases.length > 0) {
    lines.push(
      'YOUR OTHER OPEN CASES (titles only — do not conflate; everything above is THIS case):',
    )
    for (const c of otherCases) {
      lines.push(`- ${c.title?.trim() || 'Untitled case'} (status: ${c.status})`)
    }
  }

  lines.push('--- END CASE STATE ---')

  return lines.join('\n')
}
