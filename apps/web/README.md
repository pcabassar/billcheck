# billcheck V0.1 — `apps/web` (greenfield)

Fresh, greenfield V0.1. **V0 (now under `archive/v0/`) is reference only — not reused.** Built
offline / mock-first (the core + harness run with no API key and no DB); real Anthropic + Supabase
wire in behind seams.

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

**App (`app/`, `components/`) — the chat-first, mobile-first Next.js 16 surface:**
- `app/api/chat/route.ts` — POST → `respond()` on the one guarded client via `transportFromEnv()`
  (real Anthropic when `ANTHROPIC_API_KEY` is set, else the offline mock). Returns the turn's typed
  parts (cards carry values + source ids).
- `app/page.tsx` — hand-rolled chat client (demo scenarios + free text → `/api/chat` → rendered
  parts; status chip; typing).
- `components/Cards.tsx` — React VerdictCard / AmountsPanel / DocChip / Confirm / Activity, mirroring
  `src/ui/render.ts` (numbers only from sourced fields).

**Testing harness (`eval/`) — the "learn N-at-a-time" loop:**
- `personas.ts` — 12 personas from our taxonomy, oversampling the dangerous cells.
- `scorers.ts` — deterministic: provenance + false-OK (never-events) + verdict + doc-type.
- `run.ts` — batch runner → report; exit code 1 on a never-event (a CI gate).

✅ **Verified:** `pnpm --filter @billcheck/v01 eval` → **12/12 verdicts, 0 false-OK, all numbers
sourced**; `tsc --noEmit` clean; `next build` ✓ (`/` static, `/api/chat` dynamic).

**UI spec & demo:**
- `src/ui/render.ts` — framework-less `Part[] → HTML` renderer (shared visual language; the spec the
  React components mirror).
- `eval/demo.ts` → `demo/index.html` — cases **rendered from the real core** (proof the cards +
  numbers come from the pipeline, not hardcoded).

**Schema (`schema/0001_init.sql`)** — the fresh living-thread schema (Case → Bill(s) → Documents +
findings + append-only `case_events` + the `ai_calls` ledger; owner-only RLS; money as bigint cents).
Applied to the V0.1 Supabase project (private `documents` bucket created).

## Run it
```bash
pnpm install
pnpm --filter @billcheck/v01 dev        # the app (http://localhost:3000)
pnpm --filter @billcheck/v01 eval       # the simulation harness (report)
pnpm --filter @billcheck/v01 build      # production build
pnpm --filter @billcheck/v01 demo       # regenerate demo/index.html
```
Locally the app uses the **offline mock** unless `ANTHROPIC_API_KEY` is set; on Vercel the key is in
the project env, so the deployed app uses the real model. Optional: `BILLCHECK_MODEL` to pin a model.

## Status & next steps
- **Done + verified:** the guarded-client + agent-loop + tools + provenance-by-construction core; the
  offline simulation harness (the deterministic gates, as a report); the mobile-first Next.js chat app
  on that core (builds clean); deployed to Vercel (git integration, Root Directory `apps/web`).
- **Deferred by decision (Pedro):** the *formal* provenance/false-OK enforcement gates — a one-time
  ratchet to add once fact-shapes stabilize, before real users/PHI (provenance already holds by
  construction). See PLAN §9/§12.
- **Next:** real file upload + AI parse (replace the scripted demo docs); Supabase persistence +
  anonymous sessions wired to the live project; then the durable multi-week campaign layer.
