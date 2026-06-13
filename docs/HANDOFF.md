# billcheck — session handoff / live state (2026-06-12)

Durable record of everything that lives outside the code. Update on every significant session.
Plan of record: `docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md` · Conventions: `AGENTS.md`.

## Live infrastructure

| What | Identifier |
|---|---|
| GitHub | `pcabassar/billcheck` (private) — CI on push |
| Supabase project | `billcheck`, ref `etakonvmsfkyjnwksydi`, us-east-1, org "Pedro's Lab" (`hecjpavqlhpszbcanhbi`), $10/mo, migrations 0001–0008 applied, Security Advisor clean |
| Vercel project | `billcheck`, `prj_hYWF2qxNoDxRgcbZZTCowJNiUbDX`, team `team_qMEIrSgGqUAFRA5JsyYmAL2Y` (pedro-7901s-projects), rootDirectory=`apps/web`, linked at repo root (`.vercel/`) |
| Preview deploy | https://billcheck-9u0xh51ne-pedro-7901s-projects.vercel.app (Ready; Vercel-SSO protected — Pedro can open; built 2026-06-13 from `176adad` AFTER the env-record dedup. Older preview URLs run pre-review code or the corrupted key — don't use them.) |
| Production | NOT promoted — awaiting Pedro's explicit "deploy it" (`vercel deploy --prod` from repo root) |
| Env vars | local: `apps/web/.env.local` (7 keys incl. CRON_SECRET). Vercel: all 7 on production + preview + development targets. **Incident 2026-06-12:** an `echo >>` append onto a file with no trailing newline welded `CRON_SECRET` onto `ANTHROPIC_API_KEY` → `API_401 invalid x-api-key` on every LLM call (caught by the ai_calls ledger in one query). Repaired locally + re-pushed to all Vercel targets + preview redeployed. Lesson: never blind-append to env files. |

## E2E verification (2026-06-12, local dev against live Supabase + Anthropic)

Full slice PASSED on first run: synthetic bill (`/tmp/synthetic-bill.html` in repo era; regenerate via headless Chrome if needed) → classify `bill/ok` → parse 8 line items, reconciled $7,218.00 exactly → engine findings **C3 $498.00 (dup 71046) + C4 $186.00 (80053|80048 NCCI) + C5 $90.00 (36415 6u>3) = $774.00** → verdict **CONTEST** (workflow CAPTURED→VERDICT in 20s) → dispute letter generated, passed dollar/excerpt validation, approved with attestation, `response_expected_by` +30d written. ai_calls ledger captured both calls (~4¢ total).

- Demo case: `d79e1f6b-aea5-46cc-917b-b2b6c29bbfa7` · letter artifact: `faa07088-87f1-4484-b327-1dfd16929a86`
- Test account: `demo@billcheck.test` (dev-only; `profiles.is_test_account=true`; password known to Pedro/session — rotate or delete before launch)
- Dev login route `/api/auth/dev-login` is hard-disabled outside `NODE_ENV=development`

## Review round 1 (2026-06-12) — APPLIED IN CODE, MIGRATION PENDING

12-persona review → 18 confirmed findings (2 critical) all fixed in code, plus
~10 hand-verified ones from the spend-limit-truncated batch. Full record:
`docs/reviews/2026-06-12-review-round-1.md`. **Flow change:** parse now stops
at TRIAGED; the audit is an explicit kick from the confirm screen ("Looks
right — run the audit"), and the plan page waits for the verdict.

Migration 0008 APPLIED to remote (Pedro's go, 2026-06-12). E2E re-verified on
the new flow: bill-1 → CONTEST $774 (C3/C4/C5), idempotent double-kicks, edit
lock 409 post-audit, letter draft reuse. Commits pushed; preview rebuilt.

Also rotated: demo@billcheck.test password (the old one was in the client
bundle, F17). New creds live in `apps/web/.env.local` as DEV_LOGIN_EMAIL /
DEV_LOGIN_PASSWORD; the dev-login route reads env only.

## Open blockers (Pedro)

1. ~~Anonymous sign-ins toggle~~ — **FIXED 2026-06-12** (toggle needed its separate "Save changes" button; clicked via Pedro's Chrome; probe confirmed enabled). Existing anonymous profiles flagged `is_test_account=true` at that time — any anon user created later is unflagged (correct for Phase A: their LLM calls are blocked by the PHASE gate).
2. **Production promote** — one command, awaiting explicit go.
3. **claude.ai monthly spend limit hit** (2026-06-12, during review verification) — raise at claude.ai/settings/usage to re-enable workflow-scale agent runs.

## Known seams / debts (carry into next round)

- Spend alarm (LLM budget kill switch) not built — plan requires before public anonymous funnel; per-account 20/hr rate limit IS live.
- `verdicts.coverage_map` is a placeholder note; full coverage rendering + D10 v0.2 router = U12.
- Auto-triage (CAPTURED→TRIAGED) is a workflow stub until U10's real triage.
- Provisional-case orphans from dedupe flow; cleanup with U14 close action / U17 purge.
- pg_cron registration for `/api/cron/reconcile` (needs deployed URL + CRON_SECRET header) — register after prod promote.
- `vercel env add ... preview` via CLI is broken non-interactively — use the REST API (`POST /v10/projects/{id}/env?teamId=...&upsert=true`).
- **Vercel env vars can hold MULTIPLE records per key with overlapping targets** — upsert only updates the record matching its exact target set, and a stale sibling silently shadows it for that environment (bit us 2026-06-12: a corrupted `['preview','development']` ANTHROPIC_API_KEY record survived the repair and 401'd every preview LLM call). After any env change: list records and assert each key covers each target exactly once.
- AMA dev-program signup, Wellthy benchmark ask, domain/trademark check on "billcheck" — Pedro-led, untouched.

## Next round (Phase B.5 + C)

U17 purge · U18 collision claim · U10 triage (replaces auto-stub) · U11 C13/C8/C10/C9 + real reference seeds · U12 D10 v0.2 router + verdict screens (incl. S10 coverage from map) · U13 FDCPA-with-notice/S9-lite/FAP/PPDR artifacts + DeliveryChannel retrofit · U14 resolution-lite + two-tier PWYW (Stripe test keys needed from Pedro) · U15 eval completion (real-photo fixtures) · U16 manual EOB + C1/C2/C6 (PROMOTED core) · spend alarm.
