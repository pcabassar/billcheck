# billcheck — agent conventions

> **Status: CONVENTIONS (V0.1 greenfield, updated 2026-06-19).** The current conventions + invariants are in
> **V0.1 working conventions** and **Current invariants (greenfield)** below. The detailed **Hard rules /
> PHASE gate / Service-role map** sections further down are **V0-era reference** — their paths
> (`packages/shared`, `apps/web/lib/supabase/admin.ts`, WDK workflows) describe the *archived* V0 system, not
> greenfield (e.g. the one LLM entry point is now `apps/web/src/core/model.ts`). "Provenance principle"
> (formerly "bright line") is the trust invariant — see [docs/v0.1-design/PLAN.md](docs/v0.1-design/PLAN.md).

Chat-first medical-bill advisor: tell the user what a document is and what to do, backed by a deterministic
audit. **Current build: greenfield V0.1 in `apps/web`.** Doc map: [docs/START-HERE.md](docs/START-HERE.md) ·
Plan: [docs/v0.1-design/PLAN.md](docs/v0.1-design/PLAN.md) · Live state: [docs/HANDOFF.md](docs/HANDOFF.md).

## V0.1 working conventions (current — 2026-06-19)

> V0.1 is a greenfield rebuild in `apps/web`; the path-specific rules in the V0-era sections below
> are historical reference (greenfield equivalents differ — e.g. the one LLM entry point is now
> `apps/web/src/core/model.ts`, not `packages/shared`). These conventions are current:

- **Prompts: positive, clear, concise.** Tell the model what TO do, not a list of "don'ts" —
  positive instructions read clearer and are followed better. Keep system prompts short: principles
  and voice live in the prompt; detailed domain rules belong in the knowledge base, not the prompt.
- **Decisions update the docs in the same change.** When a conversation changes a plan-level
  decision (architecture, scope, a principle, the stack, the provenance posture), update the
  affected docs — `docs/v0.1-design/PLAN.md`, `PRD.md`, `docs/v0.1-design-notes.md`, and (for status)
  `docs/START-HERE.md` / `docs/HANDOFF.md` — as part of that work, each with a dated note.

## Current invariants (greenfield V0.1)

The live engineering invariants. The V0 "Hard rules" section below is the same ideas on the *archived*
paths — use these:
- **One guarded LLM client.** All Anthropic calls go through `apps/web/src/core/model.ts` (spend cap,
  PHASE gate, PHI-safe metadata-only ledger). The chat route + the model-driven loop
  (`src/core/agentModel.ts`) use it / the official SDK behind it — don't scatter raw `@anthropic-ai/sdk` calls.
- **Numbers are integer cents** everywhere; cards render only sourced fields (`{ cents, src }`).
- **The audit is deterministic** (`src/core/tools.ts`): parse/audit are pure functions; the model
  orchestrates and narrates, the facts come from code. *Prototype posture:* the model owns the card and
  provenance is a **passive divergence log** (model# vs tool#) — the strict gate returns before at-risk users.
- **PHI:** owner-only RLS; no PHI in logs; document bytes go inline to the model, never to third-party storage.
- **PHASE gate (pre-BAA):** the guarded client fails closed on PHI-bearing calls outside the allowed phase;
  production stays pre-BAA until the BAA preconditions (see the V0 PHASE-gate section below) are met.

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

- `BILLCHECK_PHASE=A`: synthetic/own/anonymized data ONLY. Document-bearing LLM calls require the owning account to be flagged test/synthetic — fail closed otherwise.
- **PRODUCTION** flips to `PHASE=B` only when ALL THREE are true: Supabase Team + HIPAA add-on active · Vercel HIPAA add-on active · Anthropic BAA signed. Record the flip in this file with the date.
- **Amendment 2026-06-12 (Pedro):** development + preview run `PHASE=B`. Rationale: both are access-restricted (localhost / Vercel SSO limited to Pedro), all uploads there are Pedro's synthetic test bills, and the per-session test-account flagging was blocking founder testing. The BAA boundary above still governs production, which stays at `PHASE=A`.

## Vendor policy

Any SDK that captures runtime data (error tracking, analytics, session replay, APM) requires, BEFORE install: (a) BAA available for Phase B, (b) PII/body capture disabled in config (`sendDefaultPii: false` or equivalent), (c) an entry in `docs/vendors.md` with BAA status. Vercel platform log capture stays suppressed for this project.

## Service-role key map

`SUPABASE_SERVICE_ROLE_KEY` may be constructed ONLY via `apps/web/lib/supabase/admin.ts`, and that module may be imported ONLY from server contexts: route handlers under `apps/web/app/api/**`, WDK workflow steps (`apps/web/workflows/**`), and server-side libs (`apps/web/lib/**` used by those). Sanctioned uses: ai_calls ledger writes (lib/llm.ts), storage upload/serving (documents API — bucket has no client policies), case_events appends from server flows, the cron reconcile route (U7), the purge job (U17), and engine-run/verdict persistence in workflow steps. Never in `apps/web/app/(case)/` or `(public)/` client components or any client bundle — CI greps `apps/web/app` for the raw env name. Use Supabase asymmetric API keys (not legacy) from day one.

## Style

- Conventional commits (`feat(scope): …`); incremental commits per logical unit.
- TypeScript strict; zod schemas in `packages/shared` are the single contract between web, engine, and workers.
- Public URL is login-gated for all AI-invoking actions until launch (access gate + per-account rate limits + spend alarm ship before the URL does).
