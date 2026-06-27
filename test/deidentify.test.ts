// Lightweight, framework-free unit checks for the PURE de-identification module (U9).
// Exercises deIdentify(), bucketAmount(), and the adversarial assertNoPii() backstop.
//
// HOW TO RUN (no test-runner dependency; tsx is already in node_modules):
//   node --import tsx test/deidentify.test.ts
//
// It imports ONLY the pure module (no DB). The module's single non-relative import
// (`import type { CaseContext }`) is type-only and is erased before execution, so tsx never
// needs the `@/` path alias here. CaseContext is reconstructed locally as a minimal stub.
import assert from 'node:assert/strict'
import {
  assertNoPii,
  bucketAmount,
  deIdentify,
  type AggregateFields,
} from '../lib/aggregate/deidentify.ts'

// Minimal CaseContext-shaped stub. deIdentify only reads caseRow.structuredState + profile, so we
// build just enough; the cast keeps us from importing the real (DB-coupled) type.
function makeCtx(opts: {
  structuredState?: Record<string, unknown>
  profile?: Record<string, unknown> | null
}): Parameters<typeof deIdentify>[0] {
  return {
    caseRow: {
      id: '00000000-0000-0000-0000-000000000000',
      userId: '00000000-0000-0000-0000-000000000001',
      title: null,
      status: 'resolved',
      summary: null,
      structuredState: opts.structuredState ?? {},
      aggregateRecordId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    profile: (opts.profile ?? null) as never,
    openArtifacts: [],
    openDeadlines: [],
    documents: [],
    status: 'resolved',
    summary: null,
  } as unknown as Parameters<typeof deIdentify>[0]
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

console.log('deidentify.test.ts')

// --- bucketAmount boundaries ------------------------------------------------------------------
check('bucketAmount boundaries', () => {
  assert.equal(bucketAmount(0), '<$100')
  assert.equal(bucketAmount(99_99), '<$100')
  assert.equal(bucketAmount(100_00), '$100-500')
  assert.equal(bucketAmount(499_99), '$100-500')
  assert.equal(bucketAmount(500_00), '$500-2k')
  assert.equal(bucketAmount(1_999_99), '$500-2k')
  assert.equal(bucketAmount(2_000_00), '$2k-10k')
  assert.equal(bucketAmount(9_999_99), '$2k-10k')
  assert.equal(bucketAmount(10_000_00), '$10k-50k')
  assert.equal(bucketAmount(49_999_99), '$10k-50k')
  assert.equal(bucketAmount(50_000_00), '$50k+')
  // Defensive clamps: negative / NaN → smallest bucket, never an error.
  assert.equal(bucketAmount(-5), '<$100')
  assert.equal(bucketAmount(Number.NaN), '<$100')
})

// --- (a) rich case → expected buckets ---------------------------------------------------------
check('rich case → expected de-identified buckets', () => {
  const ctx = makeCtx({
    profile: { coverageSituation: 'dual_qmb', state: 'wa' },
    structuredState: {
      aggregate: {
        issueType: 'Balance Billing', // mixed case + space → normalized to balance_billing
        lever: 'qmb',
        providerType: 'hospital',
        billedCents: 3_500_00, // → $2k-10k
        allowedCents: 1_200_00, // → $500-2k
        paidCents: 1_200_00, // → $500-2k
        patientRespCents: 0, // not positive → null
        outcome: 'waived',
        serviceYear: '2024', // numeric string → 2024
      },
    },
  })
  const f = deIdentify(ctx)
  assert.ok(f, 'expected a non-null record for a rich case')
  const fields = f as AggregateFields
  assert.equal(fields.issueType, 'balance_billing')
  assert.equal(fields.lever, 'qmb')
  assert.equal(fields.coverageSituation, 'dual_qmb')
  assert.equal(fields.state, 'WA')
  assert.equal(fields.providerType, 'hospital')
  assert.equal(fields.billedBucket, '$2k-10k')
  assert.equal(fields.allowedBucket, '$500-2k')
  assert.equal(fields.paidBucket, '$500-2k')
  assert.equal(fields.patientRespBucket, null) // 0 is not a positive amount
  assert.equal(fields.outcome, 'waived')
  assert.equal(fields.serviceYear, 2024)
  // The rich record must pass the adversarial backstop.
  assert.doesNotThrow(() => assertNoPii(fields))
})

check('unrecognized categorical + bad geo are DROPPED, not copied through', () => {
  const ctx = makeCtx({
    profile: { coverageSituation: 'dual_qmb', state: 'Seattle' }, // city → dropped
    structuredState: {
      aggregate: {
        issueType: 'something the model invented', // not in allow-list → null
        lever: 'qmb',
        outcome: 'resolved_full',
      },
    },
  })
  const f = deIdentify(ctx) as AggregateFields
  assert.ok(f)
  assert.equal(f.issueType, null, 'free-text issueType must be dropped')
  assert.equal(f.state, null, 'a city in the state field must be dropped (state-only)')
  assert.equal(f.coverageSituation, 'dual_qmb')
  assert.equal(f.lever, 'qmb')
  assert.equal(f.outcome, 'resolved_full')
})

// --- (b) sparse case → null -------------------------------------------------------------------
check('sparse case → null (below the meaningful-field floor)', () => {
  const sparse = makeCtx({
    profile: { state: 'wa' }, // 1 meaningful field
    structuredState: { aggregate: { lever: 'qmb' } }, // + 1 = 2 < 3
  })
  assert.equal(deIdentify(sparse), null)

  const empty = makeCtx({ profile: null, structuredState: {} })
  assert.equal(deIdentify(empty), null)
})

// --- (c) PII salted into fields → assertNoPii throws ------------------------------------------
function baseFields(): AggregateFields {
  return {
    issueType: 'denial',
    lever: 'appeal_internal',
    coverageSituation: 'commercial_in_network',
    state: 'CA',
    providerType: 'hospital',
    billedBucket: '$2k-10k',
    allowedBucket: '$500-2k',
    paidBucket: '$500-2k',
    patientRespBucket: '<$100',
    outcome: 'reduced',
    serviceYear: 2024,
  }
}

check('assertNoPii: clean buckets do NOT throw', () => {
  assert.doesNotThrow(() => assertNoPii(baseFields()))
})

check('assertNoPii: email-shaped value throws', () => {
  const f = baseFields()
  f.outcome = 'jane.doe@example.com'
  assert.throws(() => assertNoPii(f), /email/)
})

check('assertNoPii: exact money figure throws', () => {
  const f = baseFields()
  f.billedBucket = '$1,234.56' // exact cents → not a bucket
  assert.throws(() => assertNoPii(f), /exact money/)
})

check('assertNoPii: long digit run (phone/ID) throws', () => {
  const f = baseFields()
  f.providerType = 'acct 5551234567'
  assert.throws(() => assertNoPii(f), /digit run/)
})

check('assertNoPii: person-name shape throws', () => {
  const f = baseFields()
  f.issueType = 'John Smith'
  assert.throws(() => assertNoPii(f), /name/)
})

check('assertNoPii: out-of-range serviceYear throws', () => {
  const f = baseFields()
  ;(f as { serviceYear: number }).serviceYear = 1850
  assert.throws(() => assertNoPii(f), /serviceYear/)
})

check('assertNoPii: adversarial fuzz — PII in EVERY string field is caught', () => {
  // Each field individually carries PII; the guard must throw on the first one it scans.
  const f: AggregateFields = {
    issueType: 'Mary Jane Doe',
    lever: 'contact 5559998888',
    coverageSituation: 'see member@payer.com',
    state: 'SSN 123456789',
    providerType: 'paid $9,999.00',
    billedBucket: 'John Smith',
    allowedBucket: 'id 0001112223',
    paidBucket: 'a@b.co',
    patientRespBucket: '$12.34',
    outcome: 'Robert Roe',
    serviceYear: 2024,
  }
  assert.throws(() => assertNoPii(f))
  // And confirm a SINGLE-field variant for the bucket columns specifically still throws.
  for (const key of [
    'billedBucket',
    'allowedBucket',
    'paidBucket',
    'patientRespBucket',
  ] as const) {
    const g = baseFields()
    g[key] = 'Patient Name'
    assert.throws(() => assertNoPii(g), new RegExp('name'), `expected ${key} name-shape to throw`)
  }
})

console.log(`\n${passed} checks passed`)
