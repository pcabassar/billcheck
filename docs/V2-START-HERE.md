# billcheck — START HERE (doc map)

> The single entry point to the repo's docs: what's **leading** (current v2
> thinking), **operational** (the running system), and **historical** (V0).
> _Last updated 2026-06-16._
>
> **Nothing under "leading" is gospel.** These are our current thinking and
> inputs — we revise as we learn, and we already have (insurance-connect /
> system-of-record; the problem taxonomy). Material for the brainstorm, not a spec.

## Where we are
V0 is built, tested, and merged. We're pivoting to **v2: an agentic,
chat/voice-first shell around the deterministic core.** The engine stays the
source of truth for every number and verdict — the "bright line" below.

## 🧭 LEADING — current v2 thinking & inputs (read for the brainstorm)
| Doc | What | Note |
|---|---|---|
| [RETHINK-2026-06-15](RETHINK-2026-06-15-agentic-architecture.md) | The v2 thesis: agentic shell + deterministic core | Foundational, **not gospel** — being revised by newer learnings |
| [research/…taxonomy](research/2026-06-16-medical-bill-problem-taxonomy.md) | The medical-bill problem space (RETHINK §6 research pass) | Input |
| [v0-archive/…competitive-brief](v0-archive/medical-bill-dispute-competitive-brief-2026-06-11.md) | Market/competitor facts (Granted, Sheer, the EOB-API gap) | Still holds |
| [granted-insurance-connection-brief](granted-insurance-connection-brief-2026-06-16.md) | How "connect your insurance" works (credential login vs. FHIR; password-custody trade-off) | Input — integrations are accelerants, not dependencies |

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
2. **Integrations are accelerants, not dependencies.** The product must work for
   nearly anyone with just a bill (photo / upload / typed / described). Connecting
   insurance, clinical records, or payer APIs is *offered to speed things up*
   (e.g. "connect your insurer and I'll pull the EOB instead of asking you to find
   it"), never required. Upload + AI parse is the universal floor.

## What we've learned since RETHINK (revises/extends it)
- **Insurance-connect / system-of-record (Granted-style).** Fetch & organize
  EOBs ↔ bills instead of asking users to upload — and possibly *be* the organized
  home for a person's bills/claims (attacks the episodic-use → churn risk).
  Positioning fork: audit tool vs. "home for your medical billing."
- **The problem taxonomy.** ~20 patient situations across 4 families → the
  orchestrator's situation model (signal → artifact → lever → deadline).
- **Honesty wedge.** The "80% of bills have errors" claim is a myth; our edge is
  honest, substantiated numbers.

## Settled for v2 (decisions, 2026-06-16)
1. **Do both: individual audit *and* "home for your billing."** Exact positioning
   isn't important yet.
2. **Chat + UI, but chat-complete.** Ship both surfaces; everything must be doable
   via chat alone, elegantly. UI = views the agent surfaces, not a required corridor.
3. **June 27 hackathon is still a target.**
4. **Integrations are accelerants, not dependencies** (see Core principles).

## Still open for the brainstorm
- Voice: in the first cut, or fast-follow?
- What exactly we demo June 27 (the current V0 slice vs. an early v2 vertical).
- Integration build-vs-buy & the credential-custody fork: FHIR-first (top payers,
  no password custody) + universal upload, vs. Granted-style credential scraping
  later — see the [Granted brief](granted-insurance-connection-brief-2026-06-16.md).
- How much of the V0 shell to keep as a fallback during the v2 build.

## Next action
**"brainstorm billcheck v2."** Inputs ready: RETHINK + the problem taxonomy + the
competitive/Granted briefs. Repo dev server: `pnpm dev`.
