# billcheck v2 — start here

**Status (Jun 15, 2026):** V0 is built, tested, and merged to `main` (audit engine
C1–C13, D10 verdict router, full screens, resolution + PWYW). We are now pivoting
to a **v2 rethink**: chat/voice-first, an agent with tools + a knowledge base —
away from the linear click-through UI. V0 stands as the validated core.

## Read first
1. **[RETHINK-2026-06-15-agentic-architecture.md](RETHINK-2026-06-15-agentic-architecture.md)** — THE doc.
   Current-vs-proposed architecture, the one hard tension, what carries over vs.
   gets rebuilt, the new risks, and the open decisions. **Begin every v2 conversation here.**

## Supporting context
2. [PRODUCT.md](PRODUCT.md) — what billcheck is and how the verdict model works today.
3. [HANDOFF.md](HANDOFF.md) — live infra/state (Supabase, Vercel, what's deployed).
4. [ROADMAP.md](ROADMAP.md) — deferred work, incl. the "review agent flows vs. Vercel Workflow features" note.
5. [plans/2026-06-12-001-feat-billcheck-v0-plan.md](plans/2026-06-12-001-feat-billcheck-v0-plan.md) — V0 plan of record.
6. [reviews/2026-06-12-review-round-1.md](reviews/2026-06-12-review-round-1.md) — the multi-agent review that hardened V0.
7. [../AGENTS.md](../AGENTS.md) — engineering invariants (PHI rules, single LLM entry, etc.).

## The agreed direction (from RETHINK)
- An **agentic, chat/voice-first shell around a deterministic core.**
- **Bright line (non-negotiable):** the agent converses, gathers context, picks
  tools, and explains — but **never originates a number or a verdict.** The engine
  adjudicates; dollar amounts stay deterministic. (This is the asset.)
- Don't discard V0 — the engine, PHI discipline, data model, and reference/honesty
  layers carry over; the linear workflow + screens get rebuilt.

## Open decisions (settle in the brainstorm)
- Chat-only vs. chat with fallback screens; voice in the first cut or fast-follow.
- Greenlight the medical-bill-problem **research pass** (fuels the knowledge base).
- Is the **June 27 hackathon** still a target?

## Next action
Start a fresh session in this repo and say **"brainstorm billcheck v2."**
Run the problem-space research pass in parallel. The repo is at
`~/Documents/GitHub/billcheck`; dev server is `pnpm dev`.
