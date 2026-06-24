# billcheck — design notes (living)

> **⚠ HALF-BAKED BRAINSTORMED IDEAS — not a plan, just possibilities.** Early thinking captured during exploration; to be revisited after the prototype. _2026-06-16._

## Framing
billcheck is a **helpful, chat-first medical-bill advisor**: an orchestrator whose goal is to
understand the user's situation and give them the most useful help with their medical bills. It
recognizes what a document is and what to do next — from *"don't pay yet, that's a statement,"* to
*"this looks fine, pay it,"* to drafting an appeal. Most of the value is **advice and action** —
recognizing the situation, orienting the user, choosing the right lever, drafting, answering — and it
reaches for **tools** when a step benefits from them (calculations, verdicts, knowledge lookups, UI cards).

## Data model — three levels
```
Case   (the episode — e.g. "my knee surgery")        ← the "home" unit; status is DERIVED
 └─ Bill   (one biller's charge for the episode)      ← carries the lifecycle + status; actions target this
     └─ Documents  (statement · itemized bill · EOB(s) · receipt · letter · …)  ← typed evidence
```
- **Invariant:** a bill's documents (its statement, itemized bill, EOB(s), receipts,
  dispute letter) are bound to that one bill in one case — never split across cases.
- **Linking is agent-driven, user-confirmable** (not a rigid key): the agent proposes
  "this looks like the EOB for last week's surgery bill — file it together?"; a
  provider + account + date-of-service heuristic seeds the suggestion.
- **One bill → multiple EOBs** is normal: split/partial adjudication, or coordination
  of benefits (primary + secondary insurer EOBs for the same services).

## Vocabulary (most-common patient-facing terms)
- **statement** — the early, *unofficial* provider document: balance due, summary or
  department-level charges, **no line items**.
- **itemized bill** — the *official*, line-by-line bill (codes, units, per-line price);
  hospital standardized form = UB-04, professional = CMS-1500. Colloquially "the bill."
- **EOB (Explanation of Benefits)** — the insurer's document ("this is not a bill");
  Medicare's version = MSN.
- Others (unambiguous): receipt · collection notice · denial letter · GFE (Good Faith Estimate).
- Naming wrinkle: the model *object* is also called a "bill" (one biller's charge), while
  "the bill" as a *document* = the itemized one. Keeping the double-use for now; rename
  the object (e.g. "charge"/"claim") if it causes confusion.

## Bill lifecycle (a backbone, not a rigid corridor)
**New → Gathering → Reviewed → Acting → Resolved** (+ Closed)
- **New** — just captured; figuring out what it is.
- **Gathering** — need more to judge (request the itemized bill; wait on the EOB; a triage question).
- **Reviewed** — assessed: audit / verdict / advice ready.
- **Acting** — a play is in motion (dispute / appeal / FAP / validation sent; awaiting response).
- **Resolved** — settled (paid-as-correct, reduced, written off, won); **Closed** — user dropped it.
- The agent places a bill wherever reality is — it can jump ahead (straight to "in
  collections") or back (a corrected statement arrives).

## Updates from case studies (2026-06-17)
Real cases (see [the cases](cases/index.md)) revised a few things:
- **Lifecycle gains a front state + a loop:** **Expected (pre-bill)** → New → Gathering →
  Reviewed → Acting → Resolved (+ Closed; can **Reopen**). *Expected* = tracking a charge that
  hasn't arrived (scheduled service, a GFE in hand) — needed for "home for your billing."
  **Acting** is often a **multi-step campaign** (an escalation ladder), not a single act.
- **The product is a persistent advocate, not a one-shot auditor** — cases run for weeks across
  channels with deadlines + automated follow-up (durable-agent shape).
- **Levers are an arsenal, and exist for almost any bill — even "valid" ones:** benchmark-vs-market
  (à la Granted) · negotiate · payment plan · charity care/FAP · dispute/appeal · FDCPA ·
  **press/public** · hardship/bankruptcy. Honest value = a *ranked options menu + the real odds*,
  never "nothing." (Temper expectations without defeatism.)
- **Press/public pressure is a real, productized lever:** a public showcase ("wall," renamed to
  avoid lawsuits) + active outreach to local journalists/consumer reporters for egregious,
  documented, sympathetic cases. Differentiator; needs legal guardrails (truthful, user's own
  story, provider right-of-reply, opt-in).
- **The activity log is the asset** — verbatim communications + the user's narrative + decisions +
  deadlines = the evidence chain a chargeback/regulator/court needs. Capture everything, timestamped.
- **"Amounts," not "ledger"** for the money breakdown (billed / allowed / paid / owed / in-collections / disputed).
- **Scope is wider than coding audits:** coding errors → surprise/affordability → service
  misrepresentation/non-delivery disputes. Through-line: "help me with this bill."

## Triage is the center of gravity (2026-06-17, Pedro)
The case corpus is journalism-sourced, so it **over-samples egregious disputes and the "press won
it" ending** — a selection artifact, not the real distribution (see [SYNTHESIS](cases/SYNTHESIS.md)
caveat). The true **highest-frequency, highest-value jobs are mundane triage**:
1. **"Don't pay that yet — it's a *statement*, not the final bill."** (wait for the itemized bill / EOB)
2. **"This looks correct, here's why — you're fine to pay it."** (reassurance + permission)
Design implication: optimize the **common path first** (any-shape input → coverage situation +
**document-type detection** → one of a few common verdicts, incl. "don't pay yet" / "looks fine"),
and treat the full dispute arsenal (incl. press) as **depth behind it**. The dangerous error is a
**false "pay it,"** so triage accuracy — especially statement-vs-itemized-vs-EOB — is the first
thing to get right and to eval.

## Round-2 decisions (Pedro, 2026-06-17)
1. **Mobile-first** — responsive web, not a native app (snap-a-photo upload is inherently mobile; no
   app-store friction). Desktop comes ~free via responsive layout.
2. **Voice = speech-to-text *input* only** (dictate instead of type), not a 2-way voice agent. Cheap/free
   (the mobile keyboard's dictation already works in any text field; Web Speech API / Whisper for in-app).
   Defer until text works on its own.
3. **Cards: keep simple — a few to start, grow from there.** A reasonable starting set: a verdict card, an
   amounts panel, a doc chip + viewer, confirm buttons, a light activity log. Intake stays conversational.
   Each is owned / accessible / text-fallback.

## Round-3 decision (Pedro, 2026-06-17): the orchestrator reasons like a human expert
**Don't lock the agent into a fixed set of outcomes.** For each decision it should think like a sharp
patient-advocate and say what it would say — if that doesn't match a predefined verdict, **"other →
tailored advice" is valid.** Be **confidence-aware**: offer 2 options with pros/cons (or surface
uncertainty) on a real fork; don't fake certainty. **Lead with the user's actual situation, not a reflex.**
_Two Chairs lesson:_ charged $179 with no invoice → "don't pay yet, it's a statement" is wrong and "ask
for the itemized bill" alone is unhelpful; the expert opening **names it** ("you were charged and you're
surprised"). The verdict taxonomy = **recognized patterns/priors, not a switch statement.**

