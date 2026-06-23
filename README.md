# billcheck

> **Current: V0.1 (greenfield), live in production.** This README describes the **current** build.
> Doc map → [docs/START-HERE.md](docs/START-HERE.md) · Live infra/deploy state → [docs/HANDOFF.md](docs/HANDOFF.md).
> _The earlier **V0** system (a linear audit funnel on a `packages/engine` + `packages/shared` monorepo) is
> archived under `archive/v0/` — do not treat it as current. (2026-06-19)_

A **chat-first, mobile-first medical-bill advisor**: send a bill, statement, or EOB (photo / PDF / typed)
and a sharp patient-advocate agent tells you, in plain language, what it is and what to do — backed by a
deterministic audit so the numbers and the verdict are trustworthy.

## Architecture (V0.1)

Monorepo (pnpm + turbo). The app is **`apps/web`** (Next.js 16 / React 19); package name `@billcheck/v01`.

| Piece | Where | Role |
|---|---|---|
| Core ("brain") | `apps/web/src/core/` | `agentModel.ts` — the **model-driven loop** (model calls tools, owns the card). `tools.ts` — the **deterministic engine** (parse / audit / fact-book). `model.ts` — the **one guarded LLM client** (spend cap, PHASE gate, PHI-safe ledger; mock ↔ real Anthropic transport). `agent.ts` — the offline/mock path. `types.ts` — facts/cards/parts. |
| Chat surface | `apps/web/app/`, `apps/web/components/` | **Vercel AI SDK** `useChat` + a UI-message-stream `/api/chat` route; React card components. |
| Testing | `apps/web/eval/` | The offline **simulation harness** (`run.ts`, 12 personas — the CI gate) + the **divergence inspector** (`inspect-divergence.ts`). |
| Schema | `apps/web/schema/0001_init.sql` | Fresh living-thread schema (Case → Bill → Documents + findings + append-only events + `ai_calls` ledger; owner-only RLS; money as bigint cents). Applied to Supabase; **not yet wired to the app**. |

**How it works:** the model orchestrates — it calls `run_audit` (deterministic), owns the verdict card, and
fix-or-explains when its numbers differ from the tool's. Every turn logs model# vs tool# — the
**Provenance principle**, run as a *passive divergence log* for the prototype (the strict enforcement gate is
deferred to before at-risk users). Real Anthropic runs through the guarded client; offline it falls back to a
deterministic mock (the harness path).

## Develop

```bash
pnpm install
pnpm --filter @billcheck/v01 dev      # the app (http://localhost:3000)   (or: pnpm dev)
pnpm --filter @billcheck/v01 eval     # the simulation harness — the CI gate
pnpm --filter @billcheck/v01 build
pnpm --filter @billcheck/v01 typecheck
```
Locally the app uses the **offline mock** unless `ANTHROPIC_API_KEY` is set; on Vercel the key is in the
project env, so production uses the real model. `BILLCHECK_MODEL` pins the model id (default `claude-sonnet-4-6`).

## Status & what's next

**Live in production:** `https://billcheck-ruddy.vercel.app` (gated by Vercel deployment-protection). The
triage spine works on scripted demo inputs. **Next (biggest first):** real upload + parse (photo/PDF → the
model extracts line items) · the knowledge base (move obvious-case rules out of the prompt) · Supabase
persistence. Full live picture: [docs/HANDOFF.md](docs/HANDOFF.md).

## Conventions

[AGENTS.md](AGENTS.md) — engineering conventions + the current greenfield invariants. (Its detailed
"Hard rules / PHASE gate / Service-role map" sections are **V0-era reference**; the greenfield equivalents
are stated at the top of that file.)
