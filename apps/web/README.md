# billcheck V0.1 — `apps/billcheck` (greenfield)

Fresh, greenfield V0.1. **V0 (`apps/web`) is reference only — not reused.** Built offline /
mock-first (no API key, no DB needed); real Anthropic + Supabase wire in behind seams.

## What's here & what's verified

**Core (`src/core/`) — the brain, framework-agnostic TypeScript:**
- `types.ts` — facts/cards/parts. Every card money field is `{ cents, src: FactId }` — the
  **Provenance principle by construction** (numbers can only come from a tool fact).
- `tools.ts` — `parseDocument` (classify + line/EOB facts), `runAudit` (duplicate/NCCI starter),
  `buildFactBook` (the flat index of legal numeric sources).
- `model.ts` — the **one guarded client**: spend cap (checked before bytes leave), PHASE gate
  (fail-closed for PHI), PHI-safe metadata-only ledger. Pluggable transport: deterministic **mock**
  (offline) or **real Anthropic** behind `ANTHROPIC_API_KEY` (prose only — never numbers).
- `agent.ts` — `SYSTEM_PROMPT` (the principles), `decide()` (rule-based stand-in for the model's
  situation-recognition; LLM tool-calling later), `respond()` (builds cards from facts).

**Testing harness (`eval/`) — the "learn N-at-a-time" loop:**
- `personas.ts` — 12 personas from our taxonomy, oversampling the dangerous cells.
- `scorers.ts` — deterministic: provenance + false-OK (never-events) + verdict + doc-type.
- `run.ts` — batch runner → report; exit code 1 on a never-event (a CI gate later).

✅ **Verified headless:** `pnpm --filter @billcheck/v01 eval` →
**12/12 verdicts, 0 false-OK, all numbers sourced.** (Run via `node --experimental-strip-types`,
no install / no key / no browser.)

**UI:**
- `src/ui/render.ts` — framework-less `Part[] → HTML` renderer (shared visual language; the spec the
  React components will mirror).
- `eval/demo.ts` → `demo/index.html` — the three cases **rendered from the real core** (proof the
  cards + numbers come from the pipeline, not hardcoded). Open `demo/index.html` in a browser.

**Schema (`schema/0001_init.sql`)** — the fresh living-thread schema (Case → Bill(s) → Documents +
findings + append-only `case_events` + the `ai_calls` ledger; owner-only RLS; money as bigint cents).
**Authored, not applied** (no Supabase this session).

## Run it
```bash
node --experimental-strip-types apps/billcheck/eval/run.ts    # the simulation harness (report)
node --experimental-strip-types apps/billcheck/eval/demo.ts   # regenerate demo/index.html
```

## Status & next steps
- **Done + verified:** the guarded-client + agent-loop + tools + provenance-by-construction core, and
  the offline simulation harness (the deterministic gates, as a report).
- **Deferred by decision (Pedro):** the *formal* provenance/false-OK enforcement gates are a one-time
  ratchet to add once fact-shapes stabilize (provenance already holds by construction). See PLAN §9/§12.
- **Next (needs a browser + `pnpm install` + the latest-Claude id):** scaffold the **Next.js 16 app**
  (mobile-first) on this core — a `/api/chat` route calling `respond()`, a client thread rendering typed
  tool-parts into React components ported from `src/ui/render.ts` and the prototype. ⚠ Next 16 has
  breaking changes (see `apps/web/AGENTS.md`) — read its docs before scaffolding. (Decide AI-SDK-v5 vs a
  thin in-house renderer at that point — open question in PLAN §14.)
- **Then:** wire the real Anthropic transport (set `ANTHROPIC_API_KEY` + `BILLCHECK_MODEL`), apply the
  schema to a Supabase project, and swap the in-memory store for it.
