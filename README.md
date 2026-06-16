# billcheck

> **Current direction (v2):** see [docs/V2-START-HERE.md](docs/V2-START-HERE.md) (doc map) and [docs/RETHINK-2026-06-15-agentic-architecture.md](docs/RETHINK-2026-06-15-agentic-architecture.md) (north star). This README describes the **V0** build. _(2026-06-16)_

Consumer medical-bill audit: decide **pay vs. contest**, then help contest — with evidence, not vibes.

Upload a bill → we read it, run a deterministic audit, and give an honest
verdict with the dollar amounts and the legal levers behind it. The audit is
**deterministic code**, not an LLM guessing — so a verdict is reproducible and
can't be prompt-injected.

- **What it is & how it decides:** [`docs/PRODUCT.md`](docs/PRODUCT.md)
- **Live state / infra:** [`docs/HANDOFF.md`](docs/HANDOFF.md)
- **Deferred & future work:** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Conventions & invariants:** [`AGENTS.md`](AGENTS.md)
- **Plan of record:** `docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md`

## Architecture

Monorepo (pnpm + turbo):

| Package | Role |
|---|---|
| `apps/web` | Next.js 16 App Router — UI, API routes, Vercel Workflow (case lifecycle), the single LLM client wrapper, the spend alarm. |
| `packages/engine` | The deterministic audit engine + D10 verdict router. **No UI, auth, network, or DB imports.** Pure functions over typed inputs + injected reference data. |
| `packages/shared` | The single contract: zod schemas, the field-allowlist logger, the Anthropic client (PHASE gate + ledger), triage/letter/cost helpers. |

Data + runtime:

- **Supabase** (Postgres 17 + RLS + Storage + Auth) — the system of record. RLS
  is owner-only on every user table; the service-role key is constructed only
  in `apps/web/lib/supabase/admin.ts`.
- **Vercel Workflow DevKit** — the durable case lifecycle (`apps/web/workflows/
  case-lifecycle.ts`): `processCase` (parse → TRIAGED) and `auditCase`
  (audit → verdict), each composed of retryable `"use step"` functions.
- **Anthropic** (Claude Sonnet) — one constrained, structured-output call per
  task (classify / parse / letter-fill). Never in the verdict path.
- **Stripe** (optional, env-guarded) — PWYW tip checkout; inert without keys.

### The flow

```
upload → classify → parse → confirm (review extraction) → triage (coverage Qs)
   → [WAIT for EOB]  or  audit (deterministic engine) → verdict (D10 router)
   → action plan + artifacts (dispute letter, validation, itemized request, …)
   → resolution (sent / corrected statement → verified savings → PWYW)
```

## Develop

```bash
pnpm install
pnpm dev          # Next.js app (apps/web)
pnpm test         # unit tests (engine checks, router, shared, web libs)
pnpm eval         # engine golden fixtures — the CI gate
pnpm typecheck && pnpm lint && pnpm build
```

### Environment (`apps/web/.env.local`)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only (admin client) |
| `ANTHROPIC_API_KEY` | LLM calls |
| `BILLCHECK_MODEL` | model id (default `claude-sonnet-4-6`) |
| `BILLCHECK_PHASE` | `A` = pre-BAA, document LLM calls require a flagged test account (fail-closed). `B` = open. Production stays `A` until the BAA preconditions in AGENTS.md are met. |
| `CRON_SECRET` | bearer for `/api/cron/*` and `/api/jobs/*` |
| `BILLCHECK_SPEND_CEILING_CENTS` / `BILLCHECK_SPEND_WINDOW_HOURS` | spend kill switch (default $50 / 24h; `0` disables) |
| `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` | dev-only login (route hard-disabled outside development) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | optional — PWYW is inert without them |

> **Never blind-append to `.env.local`** (`echo >>`). A missing trailing
> newline once welded two keys together and 401'd every LLM call. Edit
> deliberately.

## Reference data

Versioned, append-only `ref_*` tables (NCCI / MUE / Medicare PFS / FAP / CARC).
The engine resolves the latest version **per table** at run start and stamps
each finding, so old findings stay reproducible forever. Quarterly refresh:
`scripts/refresh-reference.ts` (insert-only; ingests locally-downloaded CMS
files — CMS gates automated fetch).

## Tests & CI

`pnpm lint` (incl. no-`console.*` + no-direct-Anthropic-SDK bans), `typecheck`,
`test`, `eval` (golden fixtures with hand-computed expected findings), `build`.
The engine README (`packages/engine/README.md`) documents the check battery,
honesty contracts, and how to add a fixture.
