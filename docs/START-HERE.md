# billcheck — START HERE (doc map)

> The single entry point to the repo's docs: what's **leading** (current V0.1
> thinking), **operational** (the running system), and **historical** (V0).
> _Last updated 2026-06-17._
>
> **Naming:** the build we're about to do is **V0.1** — an increment on V0 (the
> chat-first agentic advisor). Earlier docs (RETHINK, the research brief) say
> "v2" — same build, now called V0.1.
>
> **Nothing under "leading" is gospel** — current thinking and inputs, revised as
> we learn (we already have: insurance-connect / system-of-record; the taxonomy).
> We're brainstorming V0.1 **as if from scratch.**

## Where we are
V0 is built, tested, and merged. We're building **V0.1: a helpful, chat-first
medical-bill advisor** — an agent that gives the most useful advice, backed by broad
knowledge and many tools. The deterministic engine is *one* of those tools (used when
a number or verdict must be trustworthy — the Provenance principle below), not the spine.

## 🧭 LEADING — V0.1 design & plan (brainstorm complete 2026-06-17)
**Start with the build plan, then the design docs it rests on:**
| Doc | What |
|---|---|
| [v0.1-design/PLAN](v0.1-design/PLAN.md) | **The implementation plan** for V0.1 — greenfield (see its banner), 4 phases, open-Qs resolved (+ fresh-eyes review addendum) |
| [v0.1-design/PRD](v0.1-design/PRD.md) | **The product requirements** (user/JTBD/journeys/requirements/metrics + per-phase acceptance criteria that double as the test spec) |
| [v0.1-design/prototype](v0.1-design/prototype/billcheck-prototype.html) | **Clickable prototype** (self-contained HTML, mobile-first) — 3 scripted cases: hold→OK · dispute · charged-and-surprised |
| [apps/billcheck](../apps/billcheck/) | **Phase 0 build (greenfield)** — guarded-client + agent-loop + tools core, the offline **testing harness** (verified 12/12, 0 false-OK, all sourced), a demo rendered from the real core, and the fresh schema. See `apps/billcheck/README.md` |
| [v0.1-design/00-v0-reuse-inventory](v0.1-design/00-v0-reuse-inventory.md) | ⚠ **Historical reference only** — V0.1 is **pure greenfield** (do not reuse/adapt V0 code) |
| [v0.1-design/](v0.1-design/) | The Q2–Q7 brainstorm: 02 intake & triage · 03 agent loop + tools · 04 chat UX · 05 knowledge base · 06 V0.1 scope · 07 eval & safety |
| [v0.1-design-notes](v0.1-design-notes.md) | Living decisions: framing, data model, vocabulary, lifecycle, status rollup, **triage-first** |
| [v0.1-cases/SYNTHESIS](v0.1-cases/SYNTHESIS.md) | Cross-case synthesis (31 cases): situation × lever × outcome → build implications |
| [v0.1-cases.md](v0.1-cases.md) + [v0.1-cases/](v0.1-cases/) | The 31 real, cited case files — the design's evidence base |
| [research/…competitive-and-inline-ui-landscape](research/2026-06-17-competitive-and-inline-ui-landscape.md) | Mid-2026 competitive + inline-UI scan: **bill triage is greenfield**; Granted is closest; the quantified problem |

**Earlier inputs (still useful, not gospel):**
| Doc | What | Note |
|---|---|---|
| [RETHINK-2026-06-15](RETHINK-2026-06-15-agentic-architecture.md) | The originating thesis | **Superseded framing** ("shell around the core" → now "advisor + tools, engine is *one* tool"); says "v2" = V0.1 |
| [research/…taxonomy](research/2026-06-16-medical-bill-problem-taxonomy.md) | The medical-bill problem space | Input (the cases + synthesis now lead) |
| [granted-insurance-connection-brief](granted-insurance-connection-brief-2026-06-16.md) | "connect your insurance" mechanics (credential vs. FHIR) | Integrations are accelerants, not dependencies |
| [v0-archive/…competitive-brief](v0-archive/medical-bill-dispute-competitive-brief-2026-06-11.md) | V0-era market facts | Superseded by the 2026-06-17 scan |

## ⚙️ OPERATIONAL — the running system (current)
- [HANDOFF.md](HANDOFF.md) — live infra/deploy state (Supabase, Vercel, what's deployed)
- [vendors.md](vendors.md) — vendor/BAA policy
- [../AGENTS.md](../AGENTS.md) — engineering invariants (PHI rules, single LLM entry, the Provenance principle)

## 🗄️ HISTORICAL (V0) — background only, do NOT treat as current
- [PRODUCT.md](PRODUCT.md) — V0 product + verdict model (problem framing evergreen; the linear flow is superseded)
- [ROADMAP.md](ROADMAP.md) — V0 deferred-work list
- [plans/…v0-plan](plans/2026-06-12-001-feat-billcheck-v0-plan.md) — V0 plan of record
- [reviews/…review-round-1](reviews/2026-06-12-review-round-1.md) — V0 review
- [v0-archive/](v0-archive/) — D1–D10 architecture decisions + the linear wireframes ("the before")

## Core principles (non-negotiable)
1. **The Provenance principle (RETHINK §5).** The agent converses, gathers context, picks
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
3. **Build V0.1 now.** The June 27 hackathon is a downstream checkpoint we'll cherry-pick
   from — not the organizing target. (Coding is fast with current models; **testing is the bottleneck**
   — invest there.)
4. **Integrations:** ship V0.1 upload-first with **no integration dependency**;
   build "fetch the EOB / get itemized" as a tool *seam* with a manual
   implementation now. First optional accelerant (later) = FHIR for top payers
   (covers most *lives*, no password custody); Granted-style credential scraping is
   a later/maybe (password custody + a maintenance treadmill).
5. **Pure greenfield (updated 2026-06-17, comment 10).** Build V0.1 as if V0 did not
   exist — **all V0 code, incl. the engine, is reference only, never a foundation; never
   adapt-to-fit.** Re-author the validated parts (engine, provenance gate, PHI/RLS) anew
   for the new architecture + latest model. What carries over is the **acceptance bar**
   (the 31 cases + the golden fixtures' properties), not the code. _(Supersedes the earlier
   "keep the validated core as reusable assets" framing.)_
6. **Voice:** chat-first for the V0.1 cut; voice is a fast-follow.

## Status (2026-06-17): brainstorm complete → plan built
The Q2–Q7 brainstorm is done (see [v0.1-design/](v0.1-design/)), grounded in 31 real
cases ([synthesis](v0.1-cases/SYNTHESIS.md)) and a mid-2026 UX/competitive research run.
The **[V0.1 implementation plan](v0.1-design/PLAN.md)** is written, with an
independent fresh-eyes review folded into its addendum. **No code yet** — building starts
on Pedro's go-ahead.

Headline: **triage is the spine** (the common path is "don't pay yet, that's a statement"
and "this looks fine, pay it"); the **engine is one tool** behind a chat-first advisor;
the **Provenance principle** holds (no agent-originated numbers/verdicts); **chat-first bill triage
is greenfield** in the market.

## Next action
Review the **[plan](v0.1-design/PLAN.md)**. On approval, build per its phases —
**pure greenfield** (V0 is reference only), testing-first. Repo dev server: `pnpm dev`.
