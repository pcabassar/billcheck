# billcheck — START HERE (doc map)

> The single entry point to the repo's docs: what's **leading** (current V0.1
> thinking), **operational** (the running system), and **historical** (V0).
> _Last updated 2026-06-16._
>
> **Naming:** the build we're about to do is **V0.1** — an increment on V0 (the
> agentic, chat/voice-first shell). Earlier docs (RETHINK, the research brief) say
> "v2" — same build, now called V0.1.
>
> **Nothing under "leading" is gospel** — current thinking and inputs, revised as
> we learn (we already have: insurance-connect / system-of-record; the taxonomy).
> We're brainstorming V0.1 **as if from scratch.**

## Where we are
V0 is built, tested, and merged. We're building **V0.1: an agentic, chat/voice-first
shell around the deterministic core.** The engine stays the source of truth for
every number and verdict — the bright line below.

## 🧭 LEADING — current V0.1 thinking & inputs
| Doc | What | Note |
|---|---|---|
| [RETHINK-2026-06-15](RETHINK-2026-06-15-agentic-architecture.md) | The thesis: agentic shell + deterministic core | Foundational, **not gospel** (says "v2" = V0.1) |
| [research/…taxonomy](research/2026-06-16-medical-bill-problem-taxonomy.md) | The medical-bill problem space (RETHINK §6 research pass) | Input |
| [v0-archive/…competitive-brief](v0-archive/medical-bill-dispute-competitive-brief-2026-06-11.md) | Market/competitor facts (Granted, Sheer, the EOB-API gap) | Still holds |
| [granted-insurance-connection-brief](granted-insurance-connection-brief-2026-06-16.md) | How "connect your insurance" works (credential vs. FHIR; password-custody trade-off) | Input — integrations are accelerants, not dependencies |

## ⚙️ OPERATIONAL — the running system (current)
- [HANDOFF.md](HANDOFF.md) — live infra/deploy state (Supabase, Vercel, what's deployed)
- [vendors.md](vendors.md) — vendor/BAA policy
- [../AGENTS.md](../AGENTS.md) — engineering invariants (PHI rules, single LLM entry, the bright line)

## 🗄️ HISTORICAL (V0) — background only, do NOT treat as current
- [PRODUCT.md](PRODUCT.md) — V0 product + verdict model (problem framing evergreen; the linear flow is superseded)
- [ROADMAP.md](ROADMAP.md) — V0 deferred-work list
- [plans/…v0-plan](plans/2026-06-12-001-feat-billcheck-v0-plan.md) — V0 plan of record
- [reviews/…review-round-1](reviews/2026-06-12-review-round-1.md) — V0 review
- [v0-archive/](v0-archive/) — D1–D10 architecture decisions + the linear wireframes ("the before")

## Core principles (non-negotiable)
1. **The bright line (RETHINK §5).** The agent converses, gathers context, picks
   tools, and explains. The **engine adjudicates** — every number/verdict a user
   sees or a letter contains traces to a deterministic source. The agent never
   originates a dollar amount or a verdict.
2. **Integrations are accelerants, not dependencies.** V0.1 works for nearly anyone
   with just a bill (photo / upload / typed / described). Connecting insurance,
   clinical records, or payer APIs is *offered to speed things up* (e.g. "connect
   your insurer and I'll pull the EOB instead of asking you to find it"), never
   required. Upload + AI parse is the universal floor.

## What we've learned since RETHINK (revises/extends it)
- **Insurance-connect / system-of-record (Granted-style).** Fetch & organize
  EOBs ↔ bills instead of asking users to upload — and *be* the organized home for
  a person's bills/claims (attacks the episodic-use → churn risk).
- **The problem taxonomy.** ~20 patient situations across 4 families → the
  orchestrator's situation model (signal → artifact → lever → deadline).
- **Honesty wedge.** The "80% of bills have errors" claim is a myth; our edge is
  honest, substantiated numbers.

## Settled for V0.1 (decisions, 2026-06-16)
1. **Do both:** individual audit *and* "home for your billing." Exact positioning
   isn't important yet.
2. **Chat + UI, but chat-complete** — everything doable via chat alone, elegantly.
   UI = views the agent surfaces, not a required corridor.
3. **June 27 = a full V0.1**, not a thin demo slice.
4. **Integrations:** ship V0.1 upload-first with **no integration dependency**;
   build "fetch the EOB / get itemized" as a tool *seam* with a manual
   implementation now. First optional accelerant (later) = FHIR for top payers
   (covers most *lives*, no password custody); Granted-style credential scraping is
   a later/maybe (password custody + a maintenance treadmill).
5. **Start fresh on the shell.** Brainstorm the product greenfield; keep the
   validated *core* (deterministic engine, data model, PHI discipline) as reusable
   assets — not constraints. The V0 click-through shell is not preserved as a fallback.
6. **Voice:** chat-first for the V0.1 cut; voice is a fast-follow.

## In active brainstorm (2026-06-16)
The V0.1 architecture & product design: mental model / central object · intake &
triage · the agent loop + tool contracts (bright-line enforcement) · chat UX &
agent-surfaced views · the knowledge base · eval/PHI guards · the scope cut for June 27.

## Next action
**"brainstorm billcheck V0.1."** Inputs staged: RETHINK + the problem taxonomy + the
competitive/Granted briefs. Repo dev server: `pnpm dev`.
