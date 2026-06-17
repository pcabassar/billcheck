# V0.1 design — Q3: The agent loop + tools

> **Status: LEADING (V0.1).** Brainstorm output. Not gospel. Entry: [../START-HERE.md](../START-HERE.md).
> Grounded in [../v0.1-cases/SYNTHESIS.md](../v0.1-cases/SYNTHESIS.md). _2026-06-17._

## Shape
One **durable, conversational agent** — a chat-first advisor — that maintains case state across
sessions/weeks and calls tools. It is the **orchestrator**; the deterministic engine is **one tool
among many**, not the spine. (Supersedes any "shell around the engine" framing.)

The agent is a **persistent advocate / campaign-runner**, not a one-shot auditor: a case can run for
weeks across channels with deadlines and automatic follow-up. (DurableAgent shape; the Two Chairs and
Medicare cases prove the need.)

## Orchestrator principles (how it should think & talk) — Pedro, 2026-06-17
- **Reason like a human expert, not a switch statement.** Don't lock the agent into a fixed set of
  outcomes. For each decision it asks *"what would a sharp patient-advocate say here?"* and says that —
  even if it doesn't match a predefined verdict. The common verdicts (Q2) are **recognized patterns /
  priors, not a closed menu**; **"other → here's the tailored advice" is always valid.** (Matches
  agent-native practice: features/outcomes are *emergent*, not pre-enumerated.)
- **Lead with the user's actual situation, not a reflex.** Recognize the real predicament before
  reaching for a stock line. *Two Chairs example:* the user was **already charged $179 with no itemized
  invoice** — so "don't pay yet / it's a statement" is plain wrong, and "ask for the itemized bill"
  *alone* is unhelpful. The right opening **names it**: *"you were charged and you're surprised / want to
  dispute this,"* then acts. Triage is **expert situation-recognition, not a doc-type→verdict lookup.**
- **Be confidence-aware.** The agent gauges its own certainty. High confidence → a direct answer. A
  genuine fork or lower confidence → **offer two options with pros/cons** (or surface the uncertainty and
  ask). Never fake certainty; never hide a real fork.
- **Concise, insightful, direct — don't over-explain.** Default to the useful answer; offer **"explain
  why / say more / in detail"** as a follow-up affordance (a chip, or the user just asks). Pairs with the
  conversation-trap / cognitive-load research (Q4).
- **Open-ended advice is *safe because of* the bright line.** The agent can reason freely about *what to
  say and which lever* precisely because it **cannot originate a number or a dollar-verdict** — those come
  only from tools. So the rule is: **deterministic where numbers live; open-ended where judgment adds
  value.** This is the whole architecture in one line.

## The loop
For every new input or event (user message, uploaded doc, a fired deadline, an inbound provider reply):

1. **Perceive** — normalize the input; if a document, parse it (type + line items).
2. **Orient** — load the case/bill/documents/amounts/activity-log; (re)assess the **insurance situation**.
3. **Decide** — pick the next best action: ask a question, run a tool, propose a verdict, draft an
   artifact, schedule a follow-up, or escalate. Decision is **situation-aware** (the situation→lever map).
4. **Act** — emit a message and/or a tool call. **External-effect actions require user confirmation**
   (send a letter, file a complaint, go to press, acknowledge a payment).
5. **Record** — append to the **activity log** (timestamped), update amounts + lifecycle state.

The loop is re-entrant: a fired deadline wakes the agent the same way a user message does.

## The bright line, enforced structurally
**The agent never originates a dollar amount or a verdict.** Every number/verdict a user sees, or a
letter contains, must **trace to a deterministic source**: a parsed line item, an engine finding, a
KB reference value, or a verified document diff.

Implementation pattern: tools return **typed, id'd facts** (e.g., `finding:engine:dup-7`,
`line:itemized:12`, `rule:kb:aca-2713`). When the agent asserts a number or verdict, it must cite the
source id. A validation layer (see [07-eval-and-safety.md](07-eval-and-safety.md)) rejects/flags any
asserted figure or verdict not backed by a source id. The agent's own prose is for *recognition,
explanation, framing, drafting, and orchestration* — all the value that isn't a number.

Two refinements confirmed by both the fresh-eyes review (P0-3) and 2026 agent best-practice
([research](../research/2026-06-17-agent-architecture-best-practices.md)): (1) **enforce at the artifact
boundary** — the real, checkable gate is `validateLetter`-style validation on anything outbound (card,
letter, summary), not a regex over streamed prose (you can't block what the user already saw); the prose
scanner is a flag-only tripwire. (2) **Deterministic pipeline, open-ended conversation** — the
number-producing path (**parse → audit → fact-generation**) is a **fixed workflow**; the *conversation*
(situation-recognition, lever choice, framing, drafting) is open-ended. The bright line is what makes the
open-ended part safe.

## Tool catalog (priority from the synthesis)
1. **Document parse** — PDF/photo/email → document type + structured line items + key fields. The
   **universal floor**; works for anyone, no integration needed.
2. **Knowledge-base lookup** — situation + problem → applicable **rules** (lever, conditions, clocks,
   citations). See [05-knowledge-base.md](05-knowledge-base.md). Drives both verdicts and drafting.
3. **Artifact drafting** — generate letters/filings: appeal, external-review request, **GFE/PPDR**,
   **FDCPA** validation/dispute, negotiation, charity-care application, regulator complaint (DOI/CMS/
   CFPB/AG), chargeback brief. **The single highest-frequency capability** (used in nearly every case).
   Output cites KB rule ids + case facts; user reviews before send.
4. **Deadline / cadence scheduler** — register clocks (FDCPA 30-day, PPDR 120-day, appeal windows,
   answer-the-summons, QIO/NOMNC, retroactive-Medicaid) and **auto-follow-up cadences**. Wakes the loop.
5. **The engine** — coding / duplicate / unbundling (NCCI) / benchmark-vs-Medicare/market. **Minority
   use**, on its home turf (commercial-in-network coding, uninsured benchmarking). Reuse validated V0
   C1–C13 + D10 router as pure functions.
6. **Provider / price research** — chargemaster / cash price / competitor + Medicare benchmarks; provider
   terms, marketing, public reviews (context lives beyond the bill — the Two Chairs lesson).
7. **Press / public outreach** — a renamed public "wall" + journalist outreach for egregious +
   documented + sympathetic cases. **Gated** (opt-in, truthful, provider right-of-reply). A
   differentiator, not the default play (see selection-bias caveat in the synthesis).
8. **Integrations (accelerants only)** — insurer-portal/FHIR document retrieval, etc. Never a dependency.

**MCP (distribution, not a V0.1 dependency):** exposing billcheck's tools over **MCP** lets the advisor
work **inside ChatGPT/Claude** — the answer to "why wouldn't users just use a general model?" Our moat is
the **tools + data/system-of-record + durable case state + the bright line**, which general models lack;
MCP removes the friction of making users leave their AI to get it. **Design implication (load-bearing):**
the **bright line and guards must live *in the tools themselves*** (ID-bearing facts, `validateLetter`,
HITL gates) — not only in our system prompt — so the tools stay safe and valuable **even when a general
host model orchestrates them.** Build our own chat-first app as the primary surface; offer MCP as a
fast-follow channel. (See [04-chat-ux](04-chat-ux.md).)

## Situation → tool/lever routing (condensed)
From [../v0.1-cases/SYNTHESIS.md](../v0.1-cases/SYNTHESIS.md) §2. The agent picks levers by situation:
- **Uninsured** → charity/501(r), GFE→PPDR, benchmark/prompt-pay, Form 13909, hardship. (engine: medium)
- **Commercial in-network** → ACA §2713, coding/modifier audit (**engine**), appeal→external review, DOI.
- **Commercial OON/surprise** → NSA (+loopholes), state surprise law (FI only), employer broker, external medical review.
- **Medicare FFS** → timely-filing/assignment defense, observation-status appeal, MSN redetermination ladder.
- **Medicare Advantage** → org-determination → IREO → ALJ, expedited/QIO clocks, physician necessity letter.
- **Medicaid / QMB** → balance-billing $0 defense, out-of-state emergency, retroactive eligibility timing.
- **COB** → fix primary/secondary order; ERISA vs state venue.
- **→ collections/legal** (any) → answer the summons, FDCPA, pull the EOB, negotiate payoff, bankruptcy floor.

## State the agent maintains
- **Case · Bill · Documents · Amounts · Activity log** (the data model; see [v0.1-design-notes](../v0.1-design-notes.md)).
- **Lifecycle** per bill (Expected → New → Gathering → Reviewed → Acting → Resolved/Closed; can Reopen);
  the agent **proposes** transitions, narrates the **derived case status** rollup.
- **Open clocks** and **pending follow-ups**.

## Human-in-the-loop
- **Auto (no confirm):** parsing, KB lookup, engine runs, drafting (to a *draft*), internal state updates.
- **Confirm required:** anything leaving the system — sending a letter/complaint, going to press,
  marking a bill paid, contacting a provider/insurer on the user's behalf.

## A single model client
One Anthropic client (Sonnet-class) with the `ai_calls` ledger + PHASE gate carried from V0. The agent
loop, tool-calling, and the bright-line validation all sit around this one client.

## Open questions
- How much of the loop is the model's tool-calling vs. an explicit state machine around it? (Likely:
  model drives within a thin orchestrator that owns state, clocks, and the bright-line validator.)
- Durable execution substrate for the multi-week cadence (carry V0's Vercel Workflow DevKit + Supabase Queues?).
- How does the agent decide *when* to skip the internal-appeal dead-end straight to external review/regulator? (a KB-encoded heuristic)
