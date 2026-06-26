// Render the per-turn structured-state block that seeds the system prompt.
// Pure function over loadCaseContext's output — no DB access here.
// The 3-part prompt is assembled as: SYSTEM_PROMPT + TOOL_NOTE + buildStateBlock(ctx).
import type { CaseContext } from '@/lib/db/cases'

// U4 fills this with the orchestration note (when to use the tools as a set +
// the propose-vs-confirm policy). Empty for U2 so the assembly is stable.
export const TOOL_NOTE = ''

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'unknown'
  return d.toISOString().slice(0, 10)
}

/**
 * Render the gathered case context into a compact, labeled plain-text block.
 * Sections: CASE STATUS, CASE SUMMARY, KNOWN PROFILE/SITUATION, OPEN ARTIFACTS,
 * OPEN DEADLINES, DOCUMENTS ON FILE. Kept terse to stay cache-friendly and cheap.
 */
export function buildStateBlock(ctx: CaseContext): string {
  const lines: string[] = []

  lines.push('--- CASE STATE (system-maintained; do not re-ask what is already known) ---')

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

  lines.push('--- END CASE STATE ---')

  return lines.join('\n')
}
