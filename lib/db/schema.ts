// Drizzle schema mirroring the live Supabase DB (applied via migrations).
// Source of truth for queries/types. RLS policies live in the DB (see migrations); the query
// layer relies on them via the `withUser` wrapper in ./index.ts. Do NOT `drizzle-kit push`
// without re-declaring policies — it would drop them.
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'

const tz = { withTimezone: true } as const

// 1:1 with auth.users — the coverage situation as a minimal+open object.
export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  coverageSituation: text('coverage_situation'),
  isDualQmb: boolean('is_dual_qmb').notNull().default(false),
  isSelfFunded: boolean('is_self_funded'),
  state: text('state'),
  situationNotes: text('situation_notes'),
  consentAccount: boolean('consent_account').notNull().default(true),
  consentAggregate: boolean('consent_aggregate').notNull().default(false),
  consentVersion: text('consent_version'),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
})

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    title: text('title'),
    status: text('status').notNull().default('new'), // new|gathering|recommendation_offered|acting|resolved|closed|reopened
    summary: text('summary'),
    structuredState: jsonb('structured_state').notNull().default({}),
    aggregateRecordId: uuid('aggregate_record_id'), // pointer to keyless aggregate_records (NOT a FK)
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [index('cases_user_id_idx').on(t.userId)],
)

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    caseId: uuid('case_id').notNull(),
    kind: text('kind').notNull().default('unknown'), // statement|itemized|eob|receipt|collection_notice|denial_letter|gfe|bill|unknown
    filename: text('filename'),
    contentType: text('content_type'),
    blobUrl: text('blob_url'),
    blobPathname: text('blob_pathname'),
    status: text('status').notNull().default('pending'), // pending|ready|failed
    linkedToDocId: uuid('linked_to_doc_id'), // EOB -> bill linking (self-ref)
    extracted: jsonb('extracted').notNull().default({}),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [
    index('documents_case_id_idx').on(t.caseId),
    index('documents_user_id_idx').on(t.userId),
  ],
)

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    caseId: uuid('case_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [index('timeline_events_case_id_idx').on(t.caseId)],
)

export const deadlines = pgTable(
  'deadlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    caseId: uuid('case_id').notNull(),
    kind: text('kind'),
    title: text('title'),
    dueAt: timestamp('due_at', tz).notNull(),
    status: text('status').notNull().default('open'), // open|met|passed|cancelled
    reminderStatus: text('reminder_status').notNull().default('none'), // none|pending|armed|sent|failed|cancelled
    workflowRunId: text('workflow_run_id'),
    reminderBranch: text('reminder_branch'),
    dedupKey: text('dedup_key'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  // Partial unique index (case_id, dedup_key) WHERE dedup_key IS NOT NULL is enforced in the DB.
  (t) => [index('deadlines_case_id_idx').on(t.caseId)],
)

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    caseId: uuid('case_id').notNull(),
    type: text('type'), // dispute|appeal|complaint|call_script
    title: text('title'),
    contentMd: text('content_md').notNull(),
    status: text('status').notNull().default('draft'), // draft|sent
    sentAt: timestamp('sent_at', tz),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [index('artifacts_case_id_idx').on(t.caseId)],
)

export const transcripts = pgTable(
  'transcripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    caseId: uuid('case_id').notNull(),
    messages: jsonb('messages').notNull().default([]), // AI SDK UIMessage[]
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [index('transcripts_case_id_idx').on(t.caseId)],
)

// Keyless, de-identified aggregate store. No user/case columns. Admin-client only (RLS denies others).
export const aggregateRecords = pgTable('aggregate_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueType: text('issue_type'),
  lever: text('lever'),
  coverageSituation: text('coverage_situation'),
  state: text('state'),
  providerType: text('provider_type'),
  billedBucket: text('billed_bucket'),
  allowedBucket: text('allowed_bucket'),
  paidBucket: text('paid_bucket'),
  patientRespBucket: text('patient_resp_bucket'),
  outcome: text('outcome'),
  serviceYear: integer('service_year'),
  recordedAt: timestamp('recorded_at', tz).notNull().defaultNow(),
})

export type DbSchema = {
  profiles: typeof profiles
  cases: typeof cases
  documents: typeof documents
  timelineEvents: typeof timelineEvents
  deadlines: typeof deadlines
  artifacts: typeof artifacts
  transcripts: typeof transcripts
  aggregateRecords: typeof aggregateRecords
}
