// Share card (U7) — a short, shareable "here's what happened with a medical bill and what I
// did about it" card the user can produce at any time. Prompt-generated and ANONYMIZED: the
// model drafts an anonymized version and the user PREVIEWS it before they choose to share —
// the human preview is the v1 PII backstop (a structured-field whitelist is deferred until
// real leaks are observed).
//
// Pure function of its input aside from the model call: NO DB writes here.
import { generateText } from 'ai'
import type { CaseContext, ProfileRow } from '@/lib/db/cases'

// Gateway-routed Opus (AI_GATEWAY_API_KEY). Same model string as the chat/artifact paths —
// the model choice is a safety control; never let this down-tier.
const MODEL = 'anthropic/claude-opus-4.8'

// Anonymization + honesty rules. These are the load-bearing safety instructions for the card;
// edit with care (mirrored in the U7 report).
const SYSTEM_PROMPT = `You are billcheck's share-card writer. You draft a SHORT, shareable card — a few sentences in plain Markdown — telling the story of a medical bill: what the problem was, what the person did about it, and how it turned out (or where it stands). The card is written in the first person ("I got a surprise bill...", "Here's what I did..."). It is a DRAFT the user will PREVIEW and edit before they ever choose to share it — never assume it will be posted as-is.

ABSOLUTE RULES (in priority order):

1. FULLY ANONYMIZED — this card may be shared publicly, so it must contain NO personally identifying information of ANY kind. Specifically you MUST NOT include: the person's name or anyone else's name; any member / account / policy / claim / case ID or reference number; the name of any provider, hospital, clinic, doctor, insurer, plan, or employer; a street address, email, phone number, or date of birth; an exact date of service; or any other detail that could identify the person, the provider, or the payer. Refer to parties only generically ("the hospital", "my insurer", "the billing office", "the collections agency").

2. NO EXACT DOLLAR AMOUNTS — never state a precise figure. Use only rounded or bucketed RANGES and approximations, e.g. "about $2,000", "a few hundred dollars", "roughly an 80% reduction", "the bill was cut by more than half", "down to nearly nothing". Round hard enough that the number cannot be used to re-identify the bill.

3. HONEST about the outcome — if the case is NOT a clear win, say so plainly. Describe what was learned or what the next step is; never fabricate or imply a victory that did not happen. A truthful "here's what I tried and where it stands" card is the correct output for an unresolved or partial case. Do not invent facts that are not in the context.

4. TONE — short, plain, warm, and encouraging; the kind of thing a person would actually share to help someone else facing a medical bill. No jargon dump, no legal disclaimers, no "[I am an AI]" notes, no hashtags unless they are generic and non-identifying.

OUTPUT FORMAT — return ONLY the card. Use this exact structure with no surrounding commentary, code fences, or preamble:
- Line 1: a single Markdown H2 heading (\`## ...\`) — a short, non-identifying title.
- Then a blank line, then the card body (1 short paragraph, or a few tight sentences). Markdown only.`

function fmtProfile(p: ProfileRow | null): string {
  if (!p) return 'No stored coverage situation.'
  const lines: string[] = []
  if (p.coverageSituation) lines.push(`Coverage situation: ${p.coverageSituation}`)
  if (p.isDualQmb) lines.push('Dual-eligible / QMB (protected from balance billing).')
  if (p.isSelfFunded === true) lines.push('Plan is self-funded (ERISA).')
  if (p.isSelfFunded === false) lines.push('Plan is fully-insured (state-regulated).')
  if (p.state) lines.push(`State: ${p.state}`)
  if (p.situationNotes) lines.push(`Other notes: ${p.situationNotes}`)
  return lines.length ? lines.join('\n') : 'Coverage situation on file but no fields filled.'
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

function buildPrompt(ctx: CaseContext): string {
  const summary = ctx.summary?.trim() || 'No case summary yet.'
  const stateBlob =
    ctx.caseRow.structuredState &&
    Object.keys(ctx.caseRow.structuredState as object).length
      ? JSON.stringify(ctx.caseRow.structuredState)
      : 'none'

  return `Draft the anonymized share card for this medical-bill case. The context below is INTERNAL and contains real identifying details — use it only to understand what happened; STRIP every identifier and exact amount per your rules.

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

Now write the card. If the outcome is unresolved or not a win, be honest about where it stands. Anonymize completely and use only rounded/bucketed amount ranges — no names, IDs, provider/insurer names, or exact dollar figures.`
}

// Split the model output into the H2 title and the Markdown body. The card body keeps full
// Markdown (so a preview renders it); the title is the heading text with the `##` stripped.
function splitCard(text: string): { title: string; bodyMd: string } {
  const trimmed = text.trim()
  const lines = trimmed.split('\n')
  const headingIdx = lines.findIndex((l) => /^#{1,3}\s+/.test(l.trim()))

  if (headingIdx !== -1) {
    const title = lines[headingIdx].trim().replace(/^#{1,3}\s+/, '').trim()
    const bodyMd = lines
      .slice(headingIdx + 1)
      .join('\n')
      .trim()
    if (title) return { title, bodyMd: bodyMd || trimmed }
  }

  // No parseable heading — fall back to a generic title and the whole text as the body.
  return { title: 'What happened with my medical bill', bodyMd: trimmed }
}

/**
 * Generate an anonymized share card from the case context. Prompt-generated via Opus; the
 * user previews/edits the result before sharing (the human preview is the PII backstop).
 * Pure aside from the model call — performs NO DB writes.
 */
export async function generateShareCard(
  caseContext: CaseContext,
): Promise<{ title: string; bodyMd: string }> {
  const { text } = await generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(caseContext),
    maxOutputTokens: 1200,
  })

  return splitCard(text)
}
