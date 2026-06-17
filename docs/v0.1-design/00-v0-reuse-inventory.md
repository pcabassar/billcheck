# V0.1 design — V0 reuse inventory (what we keep / adapt / drop)

> **Status: LEADING (V0.1).** Grounded inventory of the existing codebase (read-only), to drive the
> build plan. Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17._
> Principle (from RETHINK §7): keep the validated **core** (engine, contracts, AI/PHI layer, letters,
> schema/RLS, tests); **rebuild the shell** (the linear workflow corridor + the click-through UI/REST funnel).

## Stack (confirmed)
pnpm + turbo monorepo (`pnpm@10.34.3`). `apps/web` = Next.js **16.2.9** / React **19.2.4** (App Router).
`packages/engine` (pure audit engine + D10 router). `packages/shared` (zod contract + Anthropic client +
PHI logger + letters). Supabase (`supabase/migrations/0001…0009`). Durability = **Vercel Workflow
DevKit** (`workflow@^4.4.0`) + cron. `@anthropic-ai/sdk@^0.104.1`.

### Corrections to prior assumptions (matter for the plan)
- **Engine = 10 checks, not "C1–C13":** C1,C2,C3,C4,C5,C6,C8,C9,C10,C13 implemented (`packages/engine/src/run.ts`). C7/C11/C12 **deferred** (report `not_yet_available`, never silent). `c11-u11-checks.test.ts` / `c16-eob-checks.test.ts` are **test files**, not checks.
- **No pgmq/"Queues" in code** — AGENTS.md mentions it, but durability is actually **WDK + cron**. Treat Queues as aspirational.
- **Model pinned to `claude-sonnet-4-6`** (`packages/shared/src/llm/client.ts`, `BILLCHECK_MODEL`), not generic "Sonnet."
- **Stripe present but env-guarded/inert.**
- Reference tables are **hand-authored stubs** (MINI1/MINI2/TEST1), not full CMS data — fine for dev, not production.

## Keep / adapt / drop

| Asset | Path(s) | V0.1 call |
|---|---|---|
| **Audit engine + checks** (pure; injected refs; version-stamped) | `packages/engine/src/{run,checks/*,coverage,reference,types}.ts` | **KEEP** — becomes an agent **tool** |
| **Verdict (D10) router** (`ROUTER_VERSION d10-0.2`; consumes typed findings only) | `packages/engine/src/verdict/router.ts` | **KEEP** (ADAPT if verdict-as-endpoint changes) |
| **Data contracts** (zod/TS: `LineItem`, `Finding` w/ refVersions+evidence, `VerdictKind` incl. `CLEAN_PARTIAL`, coverage) | `packages/shared/src/{types,schemas/*}.ts` | **KEEP** the value objects |
| Case **state machine** (10 V0 states) + **triage** routing (`computeRoutingFlags`) | `packages/shared/src/{types,triage}.ts` | **ADAPT** — V0.1 case = living thread, triage = agent-driven |
| **Anthropic client + PHASE gate** (forced-emit structured output, 1 retry, inline doc bytes, fails closed on phase, spend-alarm seam, ledger write on every call) | `packages/shared/src/llm/client.ts` | **KEEP** ~verbatim |
| **ai_calls ledger + spendGuard wiring** | `apps/web/lib/llm.ts` | **KEEP** |
| **PHI logger** (hard field-allowlist) + cost + zod→json-schema | `packages/shared/src/{logger,llm/cost,llm/json-schema}.ts` | **KEEP** |
| **Letters/artifacts (bounded generation)** — statutory scaffold; LLM fills only delimited `{{FACTS_i}}`; **dollar figures injected from findings, never generated**; fail-closed `validateLetter`; pure static templates (FDCPA, itemized request, FAP, PPDR) | `packages/shared/src/letters/*` | **KEEP** ~verbatim — *this is the artifact-drafting tool, and it already embodies the bright line* |
| **Verified-savings diff** (anti-phantom-savings) | `apps/web/lib/savings-diff.ts` | **KEEP** — part of the bright line |
| **Parse/classify/upload** logic (single-call classify/parse, validation, rate-limit) | `apps/web/lib/parse/run-parse.ts`, `lib/upload/*` | **ADAPT** — agent-invoked, not a fixed step |
| **Supabase schema/RLS/ledger/ref tables** (owner-only RLS, append-only `case_events` w/ block-mutation trigger, private server-proxied storage, money=bigint cents, versioned `ref_*`) | `supabase/migrations/000*.sql` | **KEEP** core; **ADAPT** funnel-coupled bits (case-state trigger, verdict/deadline/attestation shapes) |
| Admin/auth/SSR Supabase glue (+ anonymous→claim) | `apps/web/lib/supabase/*`, `middleware.ts`, `lib/auth/claim.ts` | **KEEP/ADAPT** |
| **WDK workflow corridor** (`processCase`/`auditCase`: fixed parse→triage→audit→verdict march) | `apps/web/workflows/case-lifecycle.ts` | **DROP the corridor / SALVAGE step bodies**; keep **WDK as the durable substrate** for the agent loop |
| Cron reconcile + purge job | `apps/web/app/api/{cron/reconcile,jobs/purge}/route.ts`, `lib/jobs/purge.ts` | **ADAPT** |
| **Click-through UI + REST funnel** (`(case)/{upload,decode,confirm,triage,wait,audit,verdict,plan,letter,outcome}`) | `apps/web/app/(case)/**`, most `app/api/**` | **DROP** (mine the verdict **copy/rationale** for content) |
| **Engine tests + golden eval** (13 fixtures incl. **injection-resilience** + **reproducibility**; CI gates PHI-logger/no-direct-SDK/package-purity + service-role-key grep) | `packages/engine/{src/**/*.test.ts,eval/**}`, `.github/workflows/ci.yml` | **KEEP** — *the bright-line regression net* |

## Net read for the plan
- **~Half the code is reusable with little/no change:** engine, contracts, AI/PHI layer, **letters**, schema/RLS, savings-diff, and their tests. These are the "validated core."
- **The half to rebuild** is the *shell*: the linear WDK corridor and the click-through UI/REST funnel — though several **step bodies** (ref-load, engine-invoke, finding/verdict persistence with CAS guards, reconcile, purge) and **lib helpers** (parse, upload, claim, case money/queries) **salvage** into agent tools.
- **The bright line is already built**, not just aspired to: engine purity + honesty contracts, the letters bounded-generation + `validateLetter`, savings-diff, and the injection-resilience/reproducibility eval fixtures. V0.1 inherits this — the agent wraps it; it doesn't replace it.
- **Biggest plan implications:** (1) keep WDK as the durable substrate but replace the fixed corridor with the agent loop; (2) the engine/letters become **tools** the agent calls; (3) the case model moves from a 10-state linear enum to a living thread (ADAPT contracts + schema trigger); (4) don't assume pgmq exists.
