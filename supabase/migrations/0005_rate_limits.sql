-- 0005 (U4): upload rate limiting + classification/dedupe support.
--
-- Rate limiting (this file's assigned name) ships WITHOUT a table: the
-- per-user sliding window counts `documents` rows created in the last hour
-- (apps/web/lib/upload/rate-limit.ts) — every accepted upload IS a documents
-- row, and invalid files are rejected before storage/LLM, so a dedicated
-- upload_events table would only duplicate that signal. If per-IP limits or
-- pre-storage attempt metering land later (pre-public-anonymous-funnel
-- hardening), THAT is when an events table earns its keep.
--
-- What this migration does carry: the classifier-extracted dedupe fields on
-- documents (plan U4 / Key Technical Decisions "parse-time dedupe"). The D1
-- classifier extracts provider / account # / date-of-service at upload time;
-- they are stored NORMALIZED (whitespace-collapsed, uppercased) so matching
-- is deterministic across classifier runs.

alter table public.documents
  add column if not exists extracted jsonb;

comment on column public.documents.extracted is
  'Classifier-extracted upload-time fields: {provider, accountNumber, dateOfService, quality}. '
  'Normalized for dedupe matching. Document-derived content — PHI rules apply: '
  'never logged, never returned in API responses (IDs/kind/quality only).';

-- Dedupe lookup: same provider + account # + DOS across a user's cases.
-- Expression index on the three jsonb keys; user scoping happens via the
-- cases join in the query (RLS/owner filter), volume per user is tiny.
create index if not exists documents_dedupe_idx
  on public.documents (
    (extracted->>'provider'),
    (extracted->>'accountNumber'),
    (extracted->>'dateOfService')
  );

-- Rate-limit count path: owner's documents in the last hour.
create index if not exists documents_created_at_idx
  on public.documents (created_at);
