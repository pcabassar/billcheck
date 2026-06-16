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
| Granted Health insurance-connection brief | How insurance-account connection works | **Incoming** on branch `claude/fervent-carson-hu8wk9`; fold in once merged to main |

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

## The one durable invariant — the bright line (RETHINK §5)
The agent converses, gathers context, picks tools, and explains. The **engine
adjudicates** — every number/verdict a user sees or a letter contains traces to a
deterministic source. The agent never originates a dollar amount or a verdict.
(Almost everything else is open for the brainstorm.)

## What we've learned since RETHINK (revises/extends it)
- **Insurance-connect / system-of-record (Granted-style).** Fetch & organize
  EOBs ↔ bills instead of asking users to upload — and possibly *be* the organized
  home for a person's bills/claims (attacks the episodic-use → churn risk).
  Positioning fork: audit tool vs. "home for your medical billing."
- **The problem taxonomy.** ~20 patient situations across 4 families → the
  orchestrator's situation model (signal → artifact → lever → deadline).
- **Honesty wedge.** The "80% of bills have errors" claim is a myth; our edge is
  honest, substantiated numbers.

## Open decisions to settle in the brainstorm
- Chat-only vs. chat + fallback screens; voice in the first cut or fast-follow.
- Insurance-connect & the system-of-record positioning (above).
- Hackathon June 27 — still a target?
- How much of the V0 shell to keep as a fallback during the v2 build.

## Next action
**"brainstorm billcheck v2."** Inputs ready: RETHINK + the problem taxonomy + the
competitive/Granted briefs. Repo dev server: `pnpm dev`.
