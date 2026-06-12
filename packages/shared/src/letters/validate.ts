/**
 * Post-render letter validation gates (plan U9, reviews A1 + security #3).
 *
 * FAIL-CLOSED SEMANTICS: callers MUST treat `ok === false` as a hard block —
 * the letter is not persisted, rendered, or made downloadable. Anything the
 * validator cannot positively verify is a violation, never a skip:
 *
 *   1. Every $-prefixed figure in the letter must parse cleanly to integer
 *      cents AND equal one of `allowedDollarCents` (drawn from findings'
 *      amount_impact_cents and confirmed line-item amounts). A figure that
 *      cannot be parsed unambiguously (e.g. "$12.5") is itself a violation.
 *   2. Every double-quoted excerpt longer than 30 characters (straight or
 *      curly quotes) must literally appear inside one of `sourceExcerpts`.
 *
 * Violation excerpts may contain document-derived text: route them to the
 * `ai_calls` ledger (`error_payload` column), NEVER to logs and never to the
 * client response body (AGENTS.md rule 1 — sanitized error codes only).
 */

export type LetterViolationKind =
  | "dollar_amount_unallowed"
  | "dollar_amount_unparseable"
  | "quoted_excerpt_unverified";

export interface LetterViolation {
  kind: LetterViolationKind;
  /** Offending text — may contain document-derived content. Ledger only, never logs. */
  excerpt: string;
}

export interface LetterValidationResult {
  ok: boolean;
  violations: LetterViolation[];
}

/** $1,710.00 / $400 / $0.09 — integer part with optional comma grouping, optional decimals. */
const DOLLAR_FIGURE = /\$\s?(\d[\d,]*)(?:\.(\d+))?/g;

/** Straight quotes and curly quotes; only spans longer than 30 chars are checked. */
const QUOTED_EXCERPTS = [/"([^"\n]{31,})"/g, /“([^“”\n]{31,})”/g];

export function validateLetter(
  letterText: string,
  opts: { allowedDollarCents: number[]; sourceExcerpts: string[] },
): LetterValidationResult {
  const violations: LetterViolation[] = [];
  const allowed = new Set(opts.allowedDollarCents);

  for (const match of letterText.matchAll(DOLLAR_FIGURE)) {
    const whole = match[0];
    const intPart = match[1];
    const decPart = match[2];

    if (decPart !== undefined && decPart.length !== 2) {
      violations.push({ kind: "dollar_amount_unparseable", excerpt: whole });
      continue;
    }
    const dollars = Number(intPart.replace(/,/g, ""));
    const cents = dollars * 100 + (decPart !== undefined ? Number(decPart) : 0);
    if (!Number.isSafeInteger(cents)) {
      violations.push({ kind: "dollar_amount_unparseable", excerpt: whole });
      continue;
    }
    if (!allowed.has(cents)) {
      violations.push({ kind: "dollar_amount_unallowed", excerpt: whole });
    }
  }

  for (const pattern of QUOTED_EXCERPTS) {
    for (const match of letterText.matchAll(pattern)) {
      const quoted = match[1];
      if (!opts.sourceExcerpts.some((source) => source.includes(quoted))) {
        violations.push({ kind: "quoted_excerpt_unverified", excerpt: quoted });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
