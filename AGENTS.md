# billcheck — agent conventions

Consumer medical-bill audit app: decide pay-vs-contest, then help contest.
Plan of record: `docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md` (units U1–U18).
Origin spec + architecture sheet live in the gtm-pedro workspace (`working/`).

## Commands

- `pnpm typecheck` · `pnpm test` · `pnpm eval` (engine golden fixtures — CI gate) · `pnpm build` · `pnpm dev`

## Hard rules (plan invariants — lint-enforced where possible)

1. **No PHI in logs, ever.** Use `@billcheck/shared` `log`/`logError` (field allowlist). `console.*` is banned in packages and worker/job code. Never log `error.message` from parse paths — zod issues and SDK errors echo document content. Full error payloads go to the `ai_calls` ledger (Postgres), not logs.
2. **One LLM entry point.** All Anthropic calls go through `packages/shared/src/llm/client.ts` (writes an `ai_calls` ledger row per call). Direct `@anthropic-ai/sdk` imports are lint-banned everywhere else. Single model via `BILLCHECK_MODEL` env — no routing logic.
3. **Document bytes are passed inline** to the Messages API (Files API is not BAA-eligible). Never upload documents to any third-party storage besides our Supabase buckets.
4. **Engine purity.** `packages/engine` has no UI/auth/network imports; checks are pure functions over typed inputs + versioned reference tables. Document text is untrusted data — no LLM output can create, suppress, or rescore a finding inside the engine.
5. **Money is integer cents.** Everywhere. The savings diff drives payments and must never touch floats.
6. **Workflow payloads carry case IDs only.** Steps fetch PHI from Supabase; nothing document-derived enters WDK payloads, pgmq messages, or logs.
7. **Case states:** only the V0 subset in `packages/shared/src/types.ts` may be written; reserved V1 states are rejected by a DB trigger (U2). State writes are compare-and-set; steps abort on terminal states.
8. **Findings are reproducible:** every finding records check version + reference-table versions; reference tables are append-only versioned sets (never mutate prior versions).

## PHASE gate (pre-BAA boundary)

- `BILLCHECK_PHASE=A` (current): synthetic/own/anonymized data ONLY. Document-bearing LLM calls require the owning account to be flagged test/synthetic — fail closed otherwise.
- Flip to `PHASE=B` only when ALL THREE are true: Supabase Team + HIPAA add-on active · Vercel HIPAA add-on active · Anthropic BAA signed. Record the flip in this file with the date.

## Vendor policy

Any SDK that captures runtime data (error tracking, analytics, session replay, APM) requires, BEFORE install: (a) BAA available for Phase B, (b) PII/body capture disabled in config (`sendDefaultPii: false` or equivalent), (c) an entry in `docs/vendors.md` with BAA status. Vercel platform log capture stays suppressed for this project.

## Service-role key map

`SUPABASE_SERVICE_ROLE_KEY` may be constructed ONLY via `apps/web/lib/supabase/admin.ts`, and that module may be imported ONLY from server contexts: route handlers under `apps/web/app/api/**`, WDK workflow steps (`apps/web/workflows/**`), and server-side libs (`apps/web/lib/**` used by those). Sanctioned uses: ai_calls ledger writes (lib/llm.ts), storage upload/serving (documents API — bucket has no client policies), case_events appends from server flows, the cron reconcile route (U7), the purge job (U17), and engine-run/verdict persistence in workflow steps. Never in `apps/web/app/(case)/` or `(public)/` client components or any client bundle — CI greps `apps/web/app` for the raw env name. Use Supabase asymmetric API keys (not legacy) from day one.

## Style

- Conventional commits (`feat(scope): …`); incremental commits per logical unit.
- TypeScript strict; zod schemas in `packages/shared` are the single contract between web, engine, and workers.
- Public URL is login-gated for all AI-invoking actions until launch (access gate + per-account rate limits + spend alarm ship before the URL does).
