// PURE de-identification for the keyless aggregate store (U9). NO IO, NO db/model imports —
// this module is unit-testable in isolation (see test/deidentify.test.ts).
//
// Privacy posture (conservative by design):
//   - Geography: STATE only (2-letter). ZIP/city/street are dropped entirely (v1 simplest-safe).
//   - Dates: YEAR only (an int). Never a full date.
//   - Amounts: BUCKETED ranges. Never an exact figure.
//   - Categorical fields: short enums/labels only, NEVER free text copied from the case.
//   - Too-sparse records return null (we don't write a near-empty row).
//   - assertNoPii() is an adversarial backstop the writer calls before persisting.
//
// This module deliberately imports only the CaseContext *type* (erased at compile time), so it
// remains free of any runtime db/model dependency.
import type { CaseContext } from '@/lib/db/cases'

/**
 * The de-identified, bucketed fields written to `aggregate_records`. Every value is either a
 * short categorical label, a bucket string, a 2-letter state, a 4-digit year, or null.
 */
export type AggregateFields = {
  issueType: string | null
  lever: string | null
  coverageSituation: string | null
  state: string | null
  providerType: string | null
  billedBucket: string | null
  allowedBucket: string | null
  paidBucket: string | null
  patientRespBucket: string | null
  outcome: string | null
  serviceYear: number | null
}

// --- Bucket boundaries (cents) ----------------------------------------------------------------
// Mirror these labels into the aggregate_records text columns. Stable, coarse, non-reversible.
//   <$100 | $100-500 | $500-2k | $2k-10k | $10k-50k | $50k+
export type AmountBucket =
  | '<$100'
  | '$100-500'
  | '$500-2k'
  | '$2k-10k'
  | '$10k-50k'
  | '$50k+'

/**
 * Bucket a cents amount into a coarse, non-reversible range. Negative/NaN/non-finite inputs are
 * clamped to 0 (→ '<$100'); we never emit an exact figure.
 */
export function bucketAmount(cents: number): AmountBucket {
  const c = Number.isFinite(cents) && cents > 0 ? cents : 0
  if (c < 100_00) return '<$100'
  if (c < 500_00) return '$100-500'
  if (c < 2_000_00) return '$500-2k'
  if (c < 10_000_00) return '$2k-10k'
  if (c < 50_000_00) return '$10k-50k'
  return '$50k+'
}

// --- Allow-lists for categorical fields -------------------------------------------------------
// We only emit values we recognize. An unrecognized categorical value is dropped (→ null) rather
// than copied through, so free-text never leaks into the aggregate store.

const ISSUE_TYPES = new Set([
  'balance_billing',
  'surprise_billing',
  'denial',
  'coding_error',
  'duplicate_charge',
  'out_of_network',
  'preventive_billed',
  'qmb_billed',
  'overcharge',
  'collections',
  'prior_auth',
  'other',
])

const LEVERS = new Set([
  'nsa', // No Surprises Act
  'qmb', // QMB balance-billing protection
  'aca_2713', // ACA preventive services
  'appeal_internal',
  'appeal_external',
  'doi_complaint', // state Dept. of Insurance
  'erisa',
  'itemized_review',
  'charity_care',
  'financial_assistance',
  'negotiation',
  'cms_complaint',
  'other',
])

const COVERAGE_SITUATIONS = new Set([
  'uninsured',
  'commercial_in_network',
  'commercial_oon',
  'medicare_ffs',
  'medicare_advantage',
  'medicaid',
  'dual_qmb',
  'aca_marketplace',
  'two_plan_cob',
])

const PROVIDER_TYPES = new Set([
  'hospital',
  'physician',
  'lab',
  'imaging',
  'er',
  'ambulance',
  'urgent_care',
  'clinic',
  'pharmacy',
  'anesthesia',
  'pcp',
  'specialist',
  'other',
])

const OUTCOMES = new Set([
  'resolved_full',
  'resolved_partial',
  'reduced',
  'waived',
  'reprocessed',
  'denied_upheld',
  'no_response',
  'in_progress',
  'unknown',
])

// US states + DC + common territories. We only emit a recognized 2-letter code.
const STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU',
])

// --- Helpers ----------------------------------------------------------------------------------

/** Normalize a free-ish categorical token to lower_snake for allow-list comparison. */
function norm(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
  return s.length > 0 ? s : null
}

/** Emit `v` (normalized) only if it is in the allow-list; otherwise drop it (→ null). */
function pickEnum(v: unknown, allow: Set<string>): string | null {
  const n = norm(v)
  return n && allow.has(n) ? n : null
}

/** Recognized 2-letter state, uppercased — else null. Anything longer (a city/full name) drops. */
function pickState(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toUpperCase()
  return STATES.has(s) ? s : null
}

/** A plausible 4-digit service year (1990..nextYear). Accepts a number or a numeric string. */
function pickYear(v: unknown): number | null {
  let n: number | null = null
  if (typeof v === 'number' && Number.isFinite(v)) n = Math.trunc(v)
  else if (typeof v === 'string') {
    const m = v.match(/\b(19|20)\d{2}\b/)
    if (m) n = Number(m[0])
  }
  if (n === null) return null
  const maxYear = new Date().getUTCFullYear() + 1
  return n >= 1990 && n <= maxYear ? n : null
}

/** Read a cents amount (number) from an unknown source; null if not a positive finite number. */
function pickCents(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return null
}

/** Count of fields that carry a meaningful (non-null) value. */
function meaningfulCount(fields: AggregateFields): number {
  return Object.values(fields).filter((v) => v !== null && v !== undefined).length
}

// --- Extraction -------------------------------------------------------------------------------

/**
 * Extract ONLY de-identified, bucketed values from a case. Reads the structured `extracted`
 * surfaces (caseRow.structuredState + the per-document extracted bags) and the structured
 * profile — never raw free text. Returns null when the result is too sparse (< 3 meaningful
 * fields), so we never write a near-empty row.
 *
 * NOTE: this is deliberately defensive about shapes. Anything it doesn't recognize is dropped,
 * not copied through — combined with assertNoPii() that is the privacy backstop.
 */
export function deIdentify(caseContext: CaseContext): AggregateFields | null {
  const profile = caseContext.profile
  // Structured aggregate hints the model/tools may have stamped onto the case state.
  // We read from a conventional `aggregate` sub-bag if present, else the flat state.
  const state = (caseContext.caseRow.structuredState ?? {}) as Record<string, unknown>
  const agg = (isRecord(state.aggregate) ? state.aggregate : state) as Record<string, unknown>

  // Coverage situation: prefer the structured profile field, fall back to a case-state hint.
  const coverageSituation =
    pickEnum(profile?.coverageSituation, COVERAGE_SITUATIONS) ??
    pickEnum(agg.coverageSituation, COVERAGE_SITUATIONS)

  // Geography: STATE only, from the profile or the case-state hint. ZIP/city are never read.
  const stateCode = pickState(profile?.state) ?? pickState(agg.state)

  const fields: AggregateFields = {
    issueType: pickEnum(agg.issueType, ISSUE_TYPES),
    lever: pickEnum(agg.lever, LEVERS),
    coverageSituation,
    state: stateCode,
    providerType: pickEnum(agg.providerType, PROVIDER_TYPES),
    billedBucket: bucketOrNull(pickCents(agg.billedCents)),
    allowedBucket: bucketOrNull(pickCents(agg.allowedCents)),
    paidBucket: bucketOrNull(pickCents(agg.paidCents)),
    patientRespBucket: bucketOrNull(pickCents(agg.patientRespCents)),
    outcome: pickEnum(agg.outcome, OUTCOMES),
    serviceYear: pickYear(agg.serviceYear),
  }

  // Too sparse → don't write. ~3 meaningful fields is the floor.
  if (meaningfulCount(fields) < 3) return null
  return fields
}

function bucketOrNull(cents: number | null): AmountBucket | null {
  return cents === null ? null : bucketAmount(cents)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// --- Adversarial PII backstop -----------------------------------------------------------------

// An exact dollar-with-cents figure (e.g. "$1,234.56" or "1234.56") — the de-id path emits
// only bucket labels like "$2k-10k", so a value with explicit cents means raw data leaked.
const EXACT_MONEY_RE = /\$?\d[\d,]*\.\d{2}\b/
// A run of 7+ digits — phone numbers, member/claim/account IDs, SSNs (with/without separators).
const LONG_DIGIT_RUN_RE = /\d[\d\s().-]{5,}\d/
// An email address.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
// A multi-word Capitalized name-shape ("John Smith", "Mary Jane Doe") — a likely person name.
const NAME_SHAPE_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,}\b/

/**
 * The allow-listed bucket labels are the ONLY strings whose digits/punctuation are legitimate.
 * We exempt them so a bucket like "$2k-10k" doesn't trip the long-digit/exact-money guards.
 */
const BUCKET_LABELS = new Set<string>([
  '<$100',
  '$100-500',
  '$500-2k',
  '$2k-10k',
  '$10k-50k',
  '$50k+',
])

/**
 * Adversarial guard: THROW if any field looks like PII. Called by the writer BEFORE persisting,
 * as a last line of defense even though deIdentify() already allow-lists every field.
 *
 * Rejects a string field that:
 *   - contains an '@' (email),
 *   - contains a 7+ digit run (phone/ID/SSN),
 *   - contains a $-with-exact-cents figure (an exact amount, not a bucket), or
 *   - contains a multi-word Capitalized name-shape (a person name).
 * The numeric `serviceYear` is range-checked instead (it is never a free string).
 */
export function assertNoPii(fields: AggregateFields): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue

    if (key === 'serviceYear') {
      const y = typeof value === 'number' ? value : Number(value)
      const maxYear = new Date().getUTCFullYear() + 1
      if (!Number.isInteger(y) || y < 1990 || y > maxYear) {
        throw new Error(`assertNoPii: serviceYear out of range (${String(value)})`)
      }
      continue
    }

    if (typeof value !== 'string') {
      throw new Error(`assertNoPii: field "${key}" is not a string/year (${typeof value})`)
    }

    // Bucket labels are the only strings whose digits/punctuation are legitimate.
    if (BUCKET_LABELS.has(value)) continue

    if (value.includes('@') || EMAIL_RE.test(value)) {
      throw new Error(`assertNoPii: field "${key}" looks like an email`)
    }
    if (EXACT_MONEY_RE.test(value)) {
      throw new Error(`assertNoPii: field "${key}" contains an exact money amount`)
    }
    if (LONG_DIGIT_RUN_RE.test(value)) {
      throw new Error(`assertNoPii: field "${key}" contains a long digit run (phone/ID)`)
    }
    if (NAME_SHAPE_RE.test(value)) {
      throw new Error(`assertNoPii: field "${key}" looks like a person name`)
    }
  }
}
