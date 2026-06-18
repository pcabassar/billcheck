# archive/v0 — V0 (HISTORICAL REFERENCE ONLY)

This is **V0** — the original linear click-through audit funnel. **V0.1 is pure greenfield and is
NOT built on this** (decision 2026-06-17). Kept only as reference: to see what "correct" looked like
and to avoid repeating mistakes. **Do not reuse or adapt this code; do not bend the V0.1 design to it.**

- It is **removed from the active pnpm workspace** (so installs/build/CI only see the greenfield app
  in `apps/web/`). The internal `workspace:*` links here no longer resolve — it's not meant to run.
- The Supabase project it used has been **reset to the V0.1 schema**; the old migrations live in
  `archive/v0/supabase/` for reference.
- What genuinely carries forward is the **acceptance bar** (the 31 documented cases + the engine
  golden-fixture *properties*: anti-circular, injection-resilience, reproducibility), re-expressed as
  tests for the rebuilt design — not the code.

Layout (everything below is under `archive/v0/`, distinct from the greenfield top-level `apps/web`):
`apps/web` (the click-through shell), `packages/engine` (the deterministic audit engine + D10
router + golden eval), `packages/shared` (contracts, the LLM client, the letters layer), `supabase`
(V0 migrations). See `../../docs/v0.1-design/00-v0-reuse-inventory.md` for the full map.
