# Review round 1 — 2026-06-12

> **Status: HISTORICAL (V0).** Round-1 review of the V0 build. Background only. · Map: [../START-HERE.md](../START-HERE.md) · _classified 2026-06-16_

12-persona whole-repo review (correctness, security, adversarial, data-integrity,
reliability, TypeScript, testing, maintainability, standards, frontend-races,
PHI-leaks, performance) + dedup + adversarial verification (2-of-3 vote on
critical/high). 107 agents, ~4.4M tokens. Verification was cut short by the
claude.ai monthly spend limit at finding F26+; everything actioned below that
point was hand-verified in-session against the code.

## Score: 82 unique findings → 18 confirmed (2 critical, 9 high), 32 unverified (spend limit), 32 low.
Of everything that completed adversarial verification, **zero findings were refuted**.

## Fixed in this round (commit: review round 1)

| ID | Sev | Finding | Fix |
|---|---|---|---|
| F16 | critical | `profiles.is_test_account` client-writable → PHASE-gate bypass | 0008: profiles SELECT-only; all FOR ALL policies split per-command; no client UPDATE on cases, no client DELETE anywhere |
| F01 | critical | Workflow steps ignored Supabase read errors → false "clean" verdicts | every read/write checked; transient → retryable throw |
| F02 | high | State/current_run writes unverified → wedged cases, stale-run verdicts | matched-row verification on all load-bearing updates |
| F05 | high | One version label stamped on all 3 ref tables (false provenance) | per-table `ReferenceVersions` through engine + `ref_version_map` |
| F06 | high | "Latest version" = lexicographic max (MINI1 shadows 2026Q2) | `ref_versions` registry; latest = most recent load |
| F08 | high | Decode Continue/Skip → `/case/[id]` (404 dead end) | links to `/case/[id]/plan` |
| F09 | high | Cron measured parse staleness from UPLOAD time → kills live parses | `parse_started_at` stamped at claim; sweep keys on it |
| F10 | high | Delete-and-replace unfenced → doubled line items → fabricated C3 findings | `replace_line_items_and_finish` RPC: atomic, claim-fenced |
| F14 | high | POST /process non-idempotent; concurrent workflows duplicate runs/verdicts | atomic claims (`process_started_at`, `audit_locked_at`) + one-running-run unique index |
| F17 | high | Test-account password in public client bundle, works against Supabase in prod | creds server-side env only; password rotated |
| F26 | high (partial) | Append-only trigger blocks ALL case deletes; provisional rollback never worked | `rollback_provisional_case` RPC (guarded, purge-GUC). Full deletion design → U17 |
| F03 | medium | Reconciliation gate computed but never enforced | flow split: audit is an explicit kick from confirm; mismatch requires `confirmed: true` |
| F04 | medium | Non-bill documents parsed and feeding the audit | `PARSEABLE_KINDS` filter at parse/audit/verdict |
| F07 | medium | C4 disputed amount = lesser line (overstates when component uncharged) | amount = component line's charge or null; C4 → v2 |
| F23 | medium | Letter endpoint non-idempotent (artifact + LLM-spend pileup) | open-draft reuse + one-open-draft unique index |
| F49 | high* | PHASE gate failed OPEN on unrecognized phase values | gate passes only on explicit `"B"`; tests pin it |
| F73 | high* | provider/account/DOS in PostgREST URL query strings → Supabase API logs | `find_duplicate_documents` RPC (params in POST body) |
| F77 | high* | 20MB cap vs Vercel 4.5MB body limit → prod-only upload failures | 4MB cap + copy |
| F69/F70 | high* | Process kick swallowed failures, live mid-batch | surfaced errors + disabled mid-batch/in-flight |
| F71 | high* | Edit/audit TOCTOU | audit claim freezes edits (route + DB trigger) |
| F72 | medium* | Poller without deadline → infinite spinner | 150s stall state + retry kick |
| F32–F35 | med-high* | FatalError on transient DB errors; no LLM timeout; load-bearing ledger insert unretried; unchecked release | retryable errors; 120s timeout/2 retries; 3-attempt ledger write; release checked |
| F36 | medium* | Unbounded parse retries on poison documents | `parse_attempts` budget (3) |
| F62 | high* | AGENTS.md lint bans not wired for apps/web | root lint runs web; no-console + SDK-import ban enforced |
| F78 | medium* | supabase-js 1000-row default truncates ref loads | paged `loadAllRows` |
| F22 | medium | Anonymous sign-in unrate-limited | NOT fixed — deferred with spend alarm (pre-launch blocker) |
| — | — | Supabase advisors: RLS initplan ×13, FK indexes ×15 | 0008 wraps `(select auth.uid())`, adds indexes |

\* = verification was cut off by the spend limit; hand-verified in-session before fixing.

**Flow change shipped with F03/F71/F14:** `processCase` now stops at TRIAGED;
the confirm screen's "Looks right — run the audit" button is the explicit,
idempotent audit kick (`auditCase` workflow), and attestations stay open
through VERDICT so the decode screen can run alongside the audit.

## Deferred (punch list, in rough priority order)

1. **F22 — anonymous sign-in rate limiting + spend alarm** (pre-launch blocker, plan already requires it before public funnel).
2. **F26/F27 — deletion design**: right-to-deletion path, storage-object cleanup on row deletion → U17 purge work.
3. **F21 — real PDF page count at parse time** (compressed PDFs evade the heuristic; current ceilings: 4MB cap + Anthropic's 100-page API limit).
4. **F37–F41 — generated Supabase `Database` types**; `extracted`/`primary_verdict`/`coverage_map` typed contracts; `as unknown as T` laundering.
5. **F50/F51 — run-parse testability refactor + tests** (incl. ±$1 reconciliation boundary); modifier_allowed coverage (lands with U11 real seeds).
6. **F53–F55 — route tests**: letter fail-closed branches, edit-lock 409s, rate-limiter boundary.
7. **F44/F48/F63 — dead exports (`callLlm` shim, MODEL_ID/PHASE constants), duplicate `formatCents`, route-plumbing dedup.**
8. **F74 — PHASE gate semantics for prompt-only calls carrying document-derived text** (letter fill passes finding titles in Phase A — titles are engine-generated, not raw text, but the boundary deserves an explicit decision).
9. **F79 — `maxDuration` on workflow steps; parallel parses for multi-doc cases.**
10. **32 low findings** — full list in the workflow output (`tasks/wqk6yxc9d.output`); mostly naming, minor dupes, copy.

## Process notes

- Supabase security advisors: all WARNs are anonymous-access-by-design; leaked-password protection worth enabling at launch.
- The claude.ai monthly spend limit killed ~57 verifier agents; raise at claude.ai/settings/usage before the next big review round.
- The `ai_calls` ledger diagnosed the day's two field incidents (welded env key → API_401; PHASE_GATE_BLOCKED on preview) in one query each.
