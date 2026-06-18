-- U5: parse outputs on documents.
--
--   printed_total_cents  the document's OWN printed total (integer cents),
--                        extracted independently of the line items — the
--                        arithmetic reconciliation gate (plan review A1)
--                        compares sum(line_items.amount_cents) against it.
--   reconciliation_ok    true when the sum reconciles within $1; false forces
--                        full-line S3 review before AUDITED; null when the
--                        document prints no total (nothing to reconcile).
--   extracted            classifier/parse metadata jsonb: provider, account
--                        number, and date of service from the U4 classifier
--                        (parse-time dedupe inputs), plus itemized /
--                        adjudication_visible flags from the U5 parse.
--                        Convention: identifiers and flags only — bulk
--                        document text lives in typed line_items rows, never
--                        here (payload-allowlist discipline, security #4).

alter table public.documents
  add column printed_total_cents bigint,
  add column reconciliation_ok boolean,
  add column extracted jsonb not null default '{}';
