# V0.1 design — Q2: Intake & triage (the center of gravity)

> **Status: LEADING (V0.1).** Brainstorm output. Not gospel. Entry: [../START-HERE.md](../START-HERE.md).
> Grounded in [../v0.1-cases/SYNTHESIS.md](../v0.1-cases/SYNTHESIS.md). _2026-06-17._

## Why this is the center
Corrected for the case corpus's selection bias, the **most common, highest-value job is triage**,
not dispute. The two top outcomes are almost certainly:
1. **"Don't pay that yet — it's a *statement*, not the final bill."**
2. **"This looks correct — here's the math; you're fine to pay."**

Both are *reassurance + orientation*, not litigation. The dispute arsenal is depth behind this. So
intake/triage is the product's spine in practice. Get it right and most users are served in one or
two turns; the rest flow into the campaign machinery.

## The job
Take **any-shape input** and, fast, do four things: (1) figure out **what the document/message is**,
(2) figure out the user's **insurance situation**, (3) **file it** into the case/bill/documents model,
and (4) return a **clear next step** — usually one of a small set of common verdicts.

Triage is a **loop, not a one-shot**: it re-runs as new documents/events arrive and the picture sharpens.

## Any-shape input
The agent must accept, and normalize, all of:
- An uploaded **document** (PDF/photo of a statement, itemized bill, EOB, letter, receipt).
- A **forwarded email** (e.g., a provider's billing thread — like the Two Chairs case).
- **Pasted text** or a typed **question** ("I got a $400 bill, do I owe this?").
- A **photo** snapped on a phone.
- **Nothing but a worry** ("I had surgery last month, what should I expect?") → Expected/pre-bill.

Principle (from Pedro): **works for anyone, no integration required.** Upload+parse is the universal
floor; integrations only accelerate.

## Step 1 — Identify the document type (the highest-leverage early call)
Document type drives the #1 verdict. The agent classifies into the locked vocabulary:
- **statement** — early, *unofficial*, no line items → usually **"don't pay yet."**
- **itemized bill** — official, line-by-line (UB-04 / CMS-1500) → the thing you actually audit.
- **EOB** — the insurer's "this is not a bill" (Medicare = MSN) → tells you what's adjudicated.
- **receipt · collection notice · denial letter · GFE** — each routes differently.

This is also the **most dangerous** classification to get wrong in one direction: calling a real
itemized bill a "statement" and saying "don't pay yet" could blow a deadline — but the far more
dangerous error is the opposite (see "the dangerous error" below). When document type is ambiguous,
the agent says so and asks for the missing artifact rather than guessing a verdict.

## Step 2 — Establish the insurance situation (the master key)
Per the synthesis, insurance situation **decides which levers are even legal**, so it's the first
real fork. Capture (asking only what's needed, inferring from the EOB/card where possible):
- **Coverage type:** uninsured/self-pay · commercial (and **fully-insured vs self-funded/ERISA**) ·
  Medicare FFS (+Medigap) · Medicare Advantage · Medicaid (FFS vs MCO) · **dual/QMB** · TRICARE/VA · sharing-ministry/short-term.
- **Are they even using insurance?** Did they hand over the card?
- **Do they know their coverage?** "I don't know" is a legitimate branch → help them find out (read the EOB/card, or "self-funded vs fully-insured" lookup).

Two sub-facets are load-bearing and easy to forget: **fully-insured vs self-funded** (state-law leverage)
and **dual/QMB** (flips a bill to a near-automatic $0). Ask for these explicitly when relevant.

## Step 3 — File it (case → bill → documents)
- Propose a **case** (the episode) and a **bill** (the biller's charge), **user-confirmable**:
  *"This looks like the anesthesia bill for your March knee surgery — file it with that case?"*
- Seed the link with a **provider + account + date-of-service** heuristic; never a rigid key.
- **One bill → multiple EOBs** is normal; **one episode → multiple bills** is normal (multi-biller).
- Set the **lifecycle state** (Expected → New → Gathering → Reviewed → Acting → Resolved/Closed) and
  the **amounts** (billed / allowed / paid / owed / in-collections / disputed) from parsed values.

## Step 4 — The triage verdict (the common-verdict taxonomy)
Most sessions end in one of a **small set** of verdicts. Lead with the common ones:

1. **"Don't pay yet — it's a statement / not final."** Document type = statement, or an EOB with no
   corresponding bill, or charges still in adjudication. Tell them *what to wait for* (the itemized
   bill, the EOB) and roughly when. → bill goes to **Gathering/Expected**.
2. **"This looks correct — you're fine to pay."** The math reconciles (EOB cost-share = billed
   amount), coverage applied right, no engine flags, no situational lever. Give the **why** (the
   reconciliation), not just a thumbs-up. This is reassurance + *permission*. → **Reviewed → Resolved.**
3. **"Something looks off — here are your options."** An engine flag (duplicate/unbundled/benchmark),
   a situational lever (ACA preventive-$0, NSA, QMB $0, GFE breach, charity-care eligibility), or a
   service dispute. Present a **ranked options menu + real odds**, never "nothing." → **Acting.**
4. **"I need one more thing to tell you."** Can't verdict yet: request the **itemized bill**, the
   **EOB**, or a **coverage detail**. → **Gathering** with a follow-up scheduled.

Each verdict's **numbers come from a deterministic source** (parsed line items, engine finding,
KB reference) — the agent narrates, it doesn't originate (the bright line).

## The dangerous error (design asymmetry)
The costly mistake is a **false "pay it"** — telling a user a bad/erroneous bill is fine. Its cost is
asymmetric vs. a false "let's check" (which just costs a little time). So triage is **conservative**:
when confidence is low, route to verdict 4 ("let me verify") or 1 ("don't pay yet"), not 2. We will
**eval triage with special weight on the false-OK rate** (see [07-eval-and-safety.md](07-eval-and-safety.md)).

## Worked micro-examples
- *User uploads a hospital "statement," $4,800, no line items.* → identify **statement**; "**Don't pay
  this yet** — it's a summary, not an itemized bill, and your insurer may not have finished processing.
  Ask for the **itemized bill** and watch for the **EOB**. I'll track it." (verdict 1)
- *User pastes an EOB + a matching bill; cost-share $35 = billed $35; in-network.* → "**This checks
  out.** Your plan applied a $35 copay and the provider billed exactly that. **Fine to pay.**" (verdict 2)
- *Insured, in-network, prenatal labs billed diagnostic for $2,390.* → identify **itemized bill** +
  EOB; situation = commercial in-network; **engine/KB flag**: ACA §2713 preventive-$0 likely violated.
  "**This may be wrong** — these screens are usually $0 preventive. Options, best first: 1) appeal
  citing ACA §2713, 2) ask for a recode, 3) state-DOI complaint. I can draft the appeal." (verdict 3)
- *Dual-eligible (QMB) gets a $300 ambulance balance bill.* → situation = QMB; **KB**: balance-billing
  barred. "As a QMB you owe **$0** for this. I'll draft a demand citing the QMB rule + a refund request
  if you've paid." (verdict 3, near-automatic)

## What the agent needs (feeds Q3/Q5)
- **Tools:** document parse (type + line items), KB lookup (situation→lever), the engine (on flags),
  the case/bill/docs store, the amounts + activity-log writer.
- **Knowledge:** the document-type definitions, the insurance-situation taxonomy, the situation→lever map.
- **Questions it should be ready to ask (minimal, high-value):** "Is this the only bill for this
  visit?" · "Do you have the EOB / itemized bill?" · "What insurance did you use (or did you)?" ·
  "Self-funded or fully-insured — do you know?" · "Have you paid any of this?"

## Open questions
- How confidently can we detect document type from a phone photo / messy scan? (parse-quality floor)
- How much insurance-situation can we **infer** vs. must **ask**? (minimize friction without guessing)
- Where exactly is the confidence threshold between verdict 2 ("pay it") and verdict 4 ("let me verify")?
