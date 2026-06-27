// Artifact drafting — produce the REAL, ready-to-send document, personalized from the
// case context (profile + documents + case summary/status). Pure function of its input:
// its only side effect is the model call. No DB writes here (see lib/db/artifacts.ts).
import { generateText } from 'ai'
import type { CaseContext, ProfileRow } from '@/lib/db/cases'

export type ArtifactType = 'dispute' | 'appeal' | 'complaint' | 'call_script'

// Gateway-routed Opus (AI_GATEWAY_API_KEY). Same model string as the chat route — the
// model choice is a safety control; never let this down-tier.
const MODEL = 'anthropic/claude-opus-4.8'

const TYPE_BRIEF: Record<ArtifactType, string> = {
  dispute:
    'a DISPUTE LETTER to the billing provider/collections — formal, firm, requesting an itemized statement and correction of the specific error.',
  appeal:
    "an INSURANCE APPEAL LETTER to the payer — appealing a denial or underpayment, naming the basis for coverage and the member's appeal rights.",
  complaint:
    'a REGULATOR COMPLAINT — addressed to the relevant oversight body (state DOI, CMS, AG/consumer-protection, or CFPB as fits the situation), stating the facts, the harm, and the requested remedy.',
  call_script:
    'a PHONE CALL-SCRIPT the user reads aloud — an opening, the ask, fallback lines for likely pushback, and what to confirm/record before hanging up.',
}

const SYSTEM_PROMPT = `You are billcheck's drafting engine. You write the ACTUAL, ready-to-send document a patient needs to contest a medical bill or coverage decision — not advice ABOUT the document. Output complete, professional, in Markdown, ready to download/print and send as-is once the bracketed blanks are filled.

ABSOLUTE RULES (in priority order):

1. PERSONAL placeholders — fill every personal detail you KNOW from the case context (name, state, coverage situation, amounts, dates, provider, the specific issue). Where a PERSONAL field is UNKNOWN, leave a clearly-marked bracket placeholder the user fills in, e.g. [YOUR FULL NAME], [POLICY/MEMBER ID], [CLAIM NUMBER], [DATE OF SERVICE], [PROVIDER NAME], [BILLED AMOUNT]. Never invent a personal fact.

2. ANTI-HALLUCINATION — NEVER assert an unverifiable EXTERNAL specific as fact. This includes statute/regulation citations, an FDA clearance or 510(k) number or date, a CPT/HCPCS/diagnosis code you are not certain applies, a specific dollar fee-schedule figure, or a plan's exact covered-benefit language. If you are not certain of such a specific, DO NOT state it — instead leave an attributed placeholder that instructs the user or their physician to supply or cite it, e.g. "[have your physician cite the relevant FDA clearance/510(k) number]", "[cite the exact policy section from your plan's Summary of Benefits]", "[confirm the CPT code from your itemized bill]". It is always better to leave an attributed placeholder than to risk a fabricated citation. You MAY describe well-established rights frameworks in general terms (e.g. that an insured generally has a right to appeal a denial, that QMB beneficiaries are generally protected from balance billing) WITHOUT inventing a specific code/section number — frame the general right, bracket the specific citation.

3. MATCH THE ARTIFACT TYPE exactly as specified below.

4. Be concrete and usable: real structure (date line, recipient block, subject/RE line, body, sign-off), firm but professional tone, no hedging filler, no "[I am an AI]" disclaimers, no commentary outside the document itself.

Return ONLY the document content in Markdown. Do not wrap it in code fences. Do not add a preamble or explanation.`

function fmtProfile(p: ProfileRow | null): string {
  if (!p) return 'No stored profile/situation on file.'
  const lines: string[] = []
  if (p.coverageSituation) lines.push(`Coverage situation: ${p.coverageSituation}`)
  if (p.isDualQmb) lines.push('Dual-eligible / QMB: YES (protected from balance billing — patient responsibility is generally $0).')
  if (p.isSelfFunded === true) lines.push('Plan is self-funded (ERISA — federal venue, not state DOI).')
  if (p.isSelfFunded === false) lines.push('Plan is fully-insured (state-regulated — state DOI is the venue).')
  if (p.state) lines.push(`State: ${p.state}`)
  if (p.situationNotes) lines.push(`Other situation notes: ${p.situationNotes}`)
  return lines.length ? lines.join('\n') : 'Profile exists but has no filled fields.'
}

function fmtDocuments(ctx: CaseContext): string {
  if (!ctx.documents.length) return 'No documents on file (this may be a chat-only case).'
  return ctx.documents
    .map((d) => {
      const bits = [d.kind, d.filename].filter(Boolean).join(' — ')
      const extracted =
        d.extracted && Object.keys(d.extracted as object).length
          ? ` | extracted: ${JSON.stringify(d.extracted)}`
          : ''
      return `- ${bits || 'document'}${extracted}`
    })
    .join('\n')
}

function buildPrompt(type: ArtifactType, ctx: CaseContext): string {
  const summary = ctx.summary?.trim() || 'No case summary yet.'
  const stateBlob =
    ctx.caseRow.structuredState &&
    Object.keys(ctx.caseRow.structuredState as object).length
      ? JSON.stringify(ctx.caseRow.structuredState)
      : 'none'

  return `Draft ${TYPE_BRIEF[type]}

=== CASE SUMMARY ===
${summary}

Case status: ${ctx.status}
Case title: ${ctx.caseRow.title ?? '(untitled)'}

=== PATIENT PROFILE / SITUATION ===
${fmtProfile(ctx.profile)}

=== DOCUMENTS ON FILE ===
${fmtDocuments(ctx)}

=== STRUCTURED STATE (facts extracted across the case) ===
${stateBlob}

Now write the complete document. Fill what you know from the above; leave clearly-marked bracket placeholders for unknown personal fields and attributed placeholders for any external specific (statute/code/citation/FDA number) you cannot verify.`
}

/**
 * Generate a complete, ready-to-send artifact draft in Markdown, personalized from the
 * case context. Pure: the only side effect is the Opus model call. Returns a short human
 * title plus the full document body.
 */
export async function generateArtifactDraft(input: {
  type: ArtifactType
  caseContext: CaseContext
}): Promise<{ title: string; contentMd: string }> {
  const { type, caseContext } = input

  const { text } = await generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(type, caseContext),
    maxOutputTokens: 4000,
  })

  const contentMd = text.trim()
  const title = deriveTitle(type, caseContext)
  return { title, contentMd }
}

const TYPE_LABEL: Record<ArtifactType, string> = {
  dispute: 'Dispute letter',
  appeal: 'Appeal letter',
  complaint: 'Regulator complaint',
  call_script: 'Call script',
}

// Short human title, e.g. "Appeal letter — Molina inpatient denial". Built deterministically
// from the case (no extra model call): the type label plus the best available case descriptor.
function deriveTitle(type: ArtifactType, ctx: CaseContext): string {
  const label = TYPE_LABEL[type]
  const descriptor =
    ctx.caseRow.title?.trim() ||
    (ctx.profile?.coverageSituation
      ? `${ctx.profile.coverageSituation} bill`
      : 'medical bill')
  return `${label} — ${descriptor}`
}
