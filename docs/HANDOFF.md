# billcheck — session handoff / live state (2026-06-12)

> **Status: OPERATIONAL (current).** Live infra/deploy state of the running system — still accurate. · Map: [V2-START-HERE.md](V2-START-HERE.md) · _classified 2026-06-16_

Durable record of everything that lives outside the code. Update on every significant session.
Plan of record: `docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md` · Conventions: `AGENTS.md` · Product: `docs/PRODUCT.md` · Roadmap/deferred: `docs/ROADMAP.md`.

## Live infrastructure

| What | Identifier |
|---|---|
| GitHub | `pcabassar/billcheck` (private) — CI on push |
| Supabase project | `billcheck`, ref `etakonvmsfkyjnwksydi`, us-east-1, org "Pedro's Lab" (`hecjpavqlhpszbcanhbi`), $10/mo, migrations 0001–0009 applied, Security Advisor clean |
| Vercel project | `billcheck`, `prj_hYWF2qxNoDxRgcbZZTCowJNiUbDX`, team `team_qMEIrSgGqUAFRA5JsyYmAL2Y` (pedro-7901s-projects), rootDirectory=`apps/web`, linked at repo root (`.vercel/`) |
| Preview deploy | https://billcheck-ldmuaii9x-pedro-7901s-projects.vercel.app (READY; Vercel deployment-protection/SSO — Pedro opens in-browser; built 2026-06-13 from `feat/phase-b5-c`. Older preview URLs are pre-Phase-B.5+C — don't use them.) |
| Production | NOT promoted — awaiting Pedro's explicit "deploy it" (`vercel deploy --prod` from repo root) |
| Env vars | local: `apps/web/.env.local` (7 keys incl. CRON_SECRET). Vercel: all 7 on production + preview + development targets. **Incident 2026-06-12:** an `echo >>` append onto a file with no trailing newline welded `CRON_SECRET` onto `ANTHROPIC_API_KEY` → `API_401 invalid x-api-key` on every LLM call (caught by the ai_calls ledger in one query). Repaired locally + re-pushed to all Vercel targets + preview redeployed. Lesson: never blind-append to env files. |

## E2E verification (2026-06-12, local dev against live Supabase + Anthropic)

Full slice PASSED on first run: synthetic bill (`/tmp/synthetic-bill.html` in repo era; regenerate via headless Chrome if needed) → classify `bill/ok` → parse 8 line items, reconciled $7,218.00 exactly → engine findings **C3 $498.00 (dup 71046) + C4 $186.00 (80053|80048 NCCI) + C5 $90.00 (36415 6u>3) = $774.00** → verdict **CONTEST** (workflow CAPTURED→VERDICT in 20s) → dispute letter generated, passed dollar/excerpt validation, approved with attestation, `response_expected_by` +30d written. ai_calls ledger captured both calls (~4¢ total).

- Demo case: `d79e1f6b-aea5-46cc-917b-b2b6c29bbfa7` · letter artifact: `faa07088-87f1-4484-b327-1dfd16929a86`
- Test account: `demo@billcheck.test` (dev-only; `profiles.is_test_account=true`; password known to Pedro/session — rotate or delete before launch)
- Dev login route `/api/auth/dev-login` is hard-disabled outside `NODE_ENV=development`

## Phase B.5 + C (2026-06-13) — BUILT, 0009 APPLIED, PR #1 OPEN

All planned units complete on branch `feat/phase-b5-c`. 188 unit + 35 eval
tests green, lint+typecheck+build clean. Migration 0009 applied; PR #1 open.

- **U10 triage (S4) + wait (S5):** coverage questions route the case
  (WAIT/VALIDATE/APPEAL/REJECT-premise/C8/C9); flow is now confirm → triage →
  (wait | audit). Editable states extended to WAITING_*.
- **U11 engine completion:** C8 (GFE breach), C9 (FAP screening), C10 (Medicare
  anchor, null amount), C13 (payments not credited) + FAP/PFS seeds (MINI1/MINI2)
  + `ref_versions` registry + refresh-reference.ts registration. ENGINE 0.3.0.
- **U12 D10 router v0.2:** premise→status→fights→affordability cascade, stacking
  by statutory urgency; honesty gates (PAY needs full battery + zero findings;
  CLEAN_PARTIAL otherwise; summary→GET_ITEMIZED). S11 verdict + S10 coverage
  screens. `engine_runs.coverage` persisted.
- **U16 EOB + C1/C2/C6:** ParsedEob schema, EOB parse branch, balance-billing
  (pure arithmetic), never-submitted, CARC liability. ENGINE 0.4.0. Full 10-check
  battery.
- **U13 artifacts:** validation (gated on collection notice), itemized request,
  FAP checklist, PPDR guide — all behind DeliveryChannel (portal-guided + download).
- **U14 resolution + PWYW:** savings-diff (frozen baseline, anti-phantom gates),
  actions route (sent/self_report/verify_savings/close), S16 outcome, my-bills
  actions, **Stripe checkout + signature-verified webhook — env-guarded, inert
  without STRIPE_SECRET_KEY**.
- **U15 eval:** matrix fixtures 006–012 (CONTEST/REDUCE/REJECT/VALIDATE/PAY +
  injection-resilience + reproducibility), end-to-end verdict assertions, engine README.
- **U17 purge:** anonymous bytes+rows+auth users after 30d (SECURITY DEFINER
  RPCs, re-asserts is_anonymous, batch-capped, failure-isolated). `/api/jobs/purge`.
- **U18 claim path:** email-collision merge — re-parent ONLY after the target
  email's owner authenticates; single-use TTL token; uniform timing/copy.
- **Spend alarm:** rolling ai_calls cost ceiling kill switch on document-bearing
  calls (BILLCHECK_SPEND_CEILING_CENTS default $50/24h; 0 disables; fail-open).

**DONE 2026-06-13:** migration 0009 applied to remote; branch pushed; PR #1
opened (https://github.com/pcabassar/billcheck/pull/1); full E2E re-verified
LOCALLY on the new flow — CONTEST $774 (C3+C4+C5, with C10 anchors null-amount
+ MINI2 rates + per-table provenance + frozen baseline $7,218), dispute letter
+ static itemized_request artifacts, WAIT routing (insured+not-adjudicated →
WAITING_ADJUDICATION + 21d reminder). No server errors. WDK usage audited
against current docs (vercel:workflow): clean. Preview rebuilt from branch
(https://billcheck-ldmuaii9x-pedro-7901s-projects.vercel.app, READY).

**STILL ON PEDRO:**
1. **Preview app-route smoke test** — the deployment is behind Vercel
   deployment protection (SSO), so its app routes need Pedro's browser (or
   explicit go to open protection / add an automation-bypass token). Build is
   READY and identical to the locally-verified code.
2. **Merge PR #1** when satisfied.
3. **Stripe test keys** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — PWYW
   inert until then; rest of resolution works.
4. **Review round 2** once the claude.ai spend limit is raised.
5. **Production promote + pg_cron** for reconcile/purge (after merge + the
   BAA preconditions for the PHASE=B flip).

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

- ~~Spend alarm~~ BUILT (Phase B.5+C): rolling ai_calls cost ceiling on document-bearing calls. Per-account 20/hr rate limit also live. F22 (anonymous-signup rate limiting) still open.
- ~~`verdicts.coverage_map` placeholder / D10 v0.2~~ DONE (U12): real router, rationale+unlocks persisted, S10/S11 screens.
- Auto-triage (CAPTURED→TRIAGED) is a workflow stub until U10's real triage.
- Provisional-case orphans from dedupe flow; cleanup with U14 close action / U17 purge.
- pg_cron registration for `/api/cron/reconcile` (needs deployed URL + CRON_SECRET header) — register after prod promote.
- `vercel env add ... preview` via CLI is broken non-interactively — use the REST API (`POST /v10/projects/{id}/env?teamId=...&upsert=true`).
- **Vercel env vars can hold MULTIPLE records per key with overlapping targets** — upsert only updates the record matching its exact target set, and a stale sibling silently shadows it for that environment (bit us 2026-06-12: a corrupted `['preview','development']` ANTHROPIC_API_KEY record survived the repair and 401'd every preview LLM call). After any env change: list records and assert each key covers each target exactly once.
- AMA dev-program signup, Wellthy benchmark ask, domain/trademark check on "billcheck" — Pedro-led, untouched.

## Next round (Phase B.5 + C)

U17 purge · U18 collision claim · U10 triage (replaces auto-stub) · U11 C13/C8/C10/C9 + real reference seeds · U12 D10 v0.2 router + verdict screens (incl. S10 coverage from map) · U13 FDCPA-with-notice/S9-lite/FAP/PPDR artifacts + DeliveryChannel retrofit · U14 resolution-lite + two-tier PWYW (Stripe test keys needed from Pedro) · U15 eval completion (real-photo fixtures) · U16 manual EOB + C1/C2/C6 (PROMOTED core) · spend alarm.
