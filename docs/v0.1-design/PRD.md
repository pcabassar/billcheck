# billcheck V0.1 — Product Requirements (PRD)

> **Status: LEADING (V0.1).** Lean PRD synthesizing the V0.1 design corpus (the *product/user/
> requirements* view; the engineering view is [PLAN.md](PLAN.md)). Grounds in
> [START-HERE](../START-HERE.md), [design-notes](../v0.1-design-notes.md),
> [SYNTHESIS](../v0.1-cases/SYNTHESIS.md), [02-intake-and-triage](02-intake-and-triage.md),
> [06-v0.1-scope](06-v0.1-scope.md), [PLAN](PLAN.md), and the [31-case corpus](../v0.1-cases.md).
> Locked decisions honored, not relitigated. Not gospel. _2026-06-17._
>
> **UPDATE — 2026-06-19 (Pedro)** (detail in [PLAN.md](PLAN.md)'s 2026-06-19 update): (1) **adopt the Vercel
> AI SDK v6** for the chat transport (`useChat` + streaming); the model call stays on the official Anthropic
> SDK. (2) **The prototype is model-driven with loose provenance, by choice:** the model owns the card
> (numbers included), with the `run_audit` tool available, a *fix-or-explain* prompt, and a **passive
> divergence log** (model# vs tool#). The strict, blocking Provenance requirement (NFR-3, §6) is the target
> for **before at-risk users**, not the prototype (we test it before any at-risk user). Built: the deployed
> greenfield app + the verified model-driven loop.

## 1. Product in one line + the problem

**billcheck is a chat-first, mobile-first medical-bill advisor: snap or paste any confusing medical
document and a sharp patient-advocate agent tells you, in one plain sentence, what it is and what to do —
backed by deterministic tools so every number and verdict is trustworthy.**

The problem is comprehension, not just price ([competitive scan](../research/2026-06-17-competitive-and-inline-ui-landscape.md)):
- **~30% of consumers can't tell whether their EOB is a bill — even with "THIS IS NOT A BILL" printed on
  it** (Vitals 2018); 30% of insured adults find EOBs hard to understand, rising to **52% among those whose
  claim was denied** (KFF 2023).
- **Only ~4% of insured Americans can define all of deductible / coinsurance / copay / OOP-max**
  (Policygenius); fewer than half can distinguish a "claim" from an "EOB"; **72% of patients need
  clarification on their bills** (Cedar).
- **Root cause is structural and durable:** no federal EOB-layout standard, and the No Surprises Act's
  Advanced EOB is still unimplemented for insured patients — the confusion has no regulatory fix in sight.

The market gap: the category splits into *upload→AI-result* checkers and *forms→human-advocate* services.
**No product leads with "is this a statement or a bill?"** — not even the closest chat-first analogs
(Granted, Sheer, BillBusted), which jump straight to error-finding. **Chat-first bill *triage* is
greenfield**, and it maps exactly to the two highest-frequency jobs (below).

## 2. Target users + jobs-to-be-done

**Primary user:** the everyday insured *or* uninsured patient who just received a confusing medical
document and is anxious about it. Not billing experts; many can't define their own cost-share terms; the
dominant failure mode across the corpus is **non-assertion — they just pay** (SYNTHESIS §1). Mobile is
where the document arrives (a photo of a paper bill) and where the worry strikes.

**Jobs-to-be-done, in true frequency order** (triage is the center of gravity):
1. **"Tell me what this is and whether I owe it."** → most often: *"Don't pay yet — that's a statement, not
   the final bill"* (wait for the itemized bill / EOB).
2. **"Reassure me it's correct so I can pay it."** → *"This looks correct, here's the math — you're fine to
   pay."* Reassurance + **permission**.
3. **"This looks wrong / I was charged unfairly — help me fight it."** → recognize the situation, assert the
   right, draft the artifact. (The dispute arsenal: the high-stakes long tail.)

The product is a **persistent advocate, not a one-shot auditor** — real cases run for weeks. V0.1 ships the
front door of that advocate; the multi-week campaign engine is deferred (§7).

## 3. Core user journeys

Conversation shape is **concise, leads with the user's actual situation**, names the document, gives one
clear verdict + a one-line "why" + a provenance line, and offers a **"say more"** affordance. Cards:
**VerdictCard, AmountsPanel, DocChip+viewer, ConfirmButtons, ActivityLog** ([PLAN §7](PLAN.md)).

### (a) The common triage path — "don't pay yet" → "you're fine to pay"
1. User snaps a photo of a hospital **statement** ($4,800, no line items) via the composer "+".
2. `parseDocument` returns `kind: statement, itemized: false`. Agent: **"Don't pay this yet — it's a
   summary, not the itemized bill, and your insurer may not have finished processing. Ask for the itemized
   bill and watch for the EOB. I'll track it."** → **VerdictCard (⏸ don't-pay-yet) + DocChip**; bill →
   *Gathering*; ActivityLog entry.
3. Days later the user uploads the **itemized bill + EOB**; cost-share $35 = billed $35, in-network.
   `runAudit` reconciles. Agent: **"This checks out — your plan applied a $35 copay and the provider billed
   exactly that. Fine to pay."** → **VerdictCard (✅ looks-correct) + AmountsPanel** (billed / allowed /
   paid / owed, each row carrying its source id); bill → *Reviewed → Resolved*.

### (b) The dispute path — engine flags an error → ranked options → drafted appeal behind a confirm
*Grounded in case 01 (Holmes, one surgery billed as two — NCCI/duplicate) and case 2.1/2.4 (ACA §2713).*
1. User uploads an **itemized bill + EOB**: prenatal screens billed *diagnostic*, $2,390 owed; insured,
   fully-insured, in-network.
2. `runAudit` + `kbLookup` flag a likely **ACA §2713 preventive-$0** violation. Agent leads with the
   situation: **"This may be wrong — these screens are usually $0 preventive care."** → **VerdictCard (⚠
   something's-off, `role="alert"`) + AmountsPanel + ranked options:** *(1) appeal citing ACA §2713 [best],
   (2) ask for a recode, (3) state-DOI complaint* — a ranked menu with real odds, never "nothing."
3. User picks the appeal. `draftArtifact` produces an ACA §2713 appeal: a fixed statutory scaffold,
   **dollar figures injected from findings (never generated)**, `validateLetter` passes. → **ConfirmButtons
   (Approve / Edit / Reject)** with preview — outbound is hard-gated. On approve, fact-attestation captured;
   ActivityLog records the paper trail.

### (c) The "charged-and-surprised" path (Two Chairs)
*Grounded in case 03 — the verdict set is recognized patterns, not a switch statement.*
1. User forwards the provider's billing **email thread**: a $179 "onboarding" call billed as a clinical
   session; already charged; no itemized invoice.
2. A doc-type→verdict lookup would wrongly say *"don't pay yet, it's a statement"* (already charged) or
   unhelpfully *"ask for the itemized bill."* Reasoning like an expert, the agent **names the predicament**:
   **"You were charged $179 and you're surprised — and there's no itemized invoice. This isn't a 'wait for
   the bill' situation; it's a dispute."** → **VerdictCard (🧾 you-were-charged / dispute).**
3. Agent lays out the dispute levers (misrepresentation + non-delivery; chargeback; regulator) as a ranked
   menu and offers to draft the first artifact behind **ConfirmButtons**. *(The full multi-week escalation
   campaign is the deferred fast-follow; V0.1 delivers the recognition + the first drafted artifact.)*

## 4. Functional requirements

- **FR-1 Any-shape intake.** Accept and normalize: uploaded document (PDF/photo of statement, itemized
  bill, EOB, letter, receipt), forwarded email, pasted text, typed question, or "nothing but a worry" (→
  *Expected*/pre-bill). Upload+parse is the universal floor; **no integration required** (integrations are
  accelerants, not dependencies). Intake stays **conversational** (no form card in V0.1).
- **FR-2 Document-type detection.** `parseDocument` classifies into the locked vocabulary — **statement**
  (unofficial, no line items) vs **itemized bill** (UB-04/CMS-1500, line-by-line) vs **EOB** (insurer's
  "this is not a bill"; Medicare = MSN) vs receipt / collection notice / denial letter / GFE. `itemized:
  false` on a bill drives the "statement → don't-pay-yet" recognition. When type is ambiguous, the agent
  **says so and asks for the missing artifact** rather than guessing a verdict.
- **FR-3 Insurance-situation capture (the master key).** Capture coverage type — uninsured/self-pay ·
  commercial (**fully-insured vs self-funded/ERISA**) · Medicare FFS (+Medigap) · Medicare Advantage ·
  Medicaid (FFS vs MCO) · **dual/QMB** · TRICARE/VA · sharing-ministry/short-term — plus *are they using
  insurance?* and *do they know their coverage?* ("I don't know" is a legitimate branch). The two
  load-bearing sub-facets — **fully-insured-vs-self-funded** (state-law leverage) and **dual/QMB** (flips to
  a near-automatic $0) — captured explicitly. Inferred from the EOB/card where possible; asked only when needed.
- **FR-4 Verdict patterns (recognized, not a closed set).** The agent reasons like a human expert and uses
  a recognized pattern *only if it genuinely fits*; **"other → tailored advice" is always valid.** Patterns:
  (1) don't-pay-yet, (2) looks-correct, (3) something's-off (ranked options), (4) need-more, (5)
  you-were-charged/dispute. **Confidence-aware:** direct answer when sure; **two options with pros/cons** on
  a genuine fork. **Leads with the user's actual situation**, not a reflex.
- **FR-5 In-scope lever set** (small, demoable, spanning the situation→lever map): **statement →
  don't-pay-yet**; **EOB↔bill reconciliation → looks-correct**; an **engine coding flag** on its home turf
  (duplicate / NCCI-unbundling and/or preventive-vs-diagnostic) → something's-off; and **one
  assertion-of-right lever end-to-end — ACA §2713 preventive-$0 — with a drafted appeal**. The full arsenal
  (PPDR, charity care/501(r), NSA, QMB-$0, FDCPA, press) is depth behind this, deferred.
- **FR-6 Artifact drafting with HITL confirm.** `draftArtifact` produces bounded-generation letters (fixed
  statutory scaffold; LLM fills only delimited fact slots; **dollar figures injected from findings, never
  generated**); a fail-closed `validateLetter` rejects any unsourced figure or unverified quote. Anything
  outbound requires **`needsApproval` → ConfirmButtons → fact-attestation**, then persist + log.
- **FR-7 The activity log.** Append-only, timestamped, mutation-blocked: documents, tool runs, verdicts
  proposed, confirmations, outbound artifacts, deadlines. It is the **evidence chain** (for a chargeback/
  regulator/court) *and* the agent's transparency surface.
- **FR-8 The data model.** `Case` (the episode; **status is derived**) → `Bill` (one biller's charge;
  **carries the lifecycle + status**; actions target it; one episode → multiple bills is normal) →
  `Documents` (typed evidence bound to one bill; one bill → multiple EOBs is normal). Plus per-bill
  **Amounts** (billed / allowed / paid / owed / in-collections / disputed, **each carrying its source id**)
  and a first-class **insurance situation** (account profile + per-bill snapshot). **Lifecycle:** Expected →
  New → Gathering → Reviewed → Acting → Resolved (+ Closed; can Reopen) — a backbone, not a rigid corridor.
  **Case-status rollup** computed deterministically (Action needed → In progress → Waiting on insurer →
  Resolved; Resolved requires *all* bills resolved) and **the agent narrates it; it does not decide it.**
  *First cut: model bills natively but exercise one-episode-one-bill well; multi-biller UX stays light.*

## 5. Non-functional requirements

- **NFR-1 Mobile-first responsive web (not native).** Snap-a-photo upload is inherently mobile; no
  app-store friction. 44–48px targets, thumb-zone primary actions, docked composer; desktop comes ~free via
  responsive layout (no desktop-polish investment).
- **NFR-2 Accessibility (WCAG).** Every card owned and accessible — **icon + color + text, never color
  alone**, with a **text-equivalent fallback** so it works chat-only (voice/SMS-ready). The thread is a
  single persistent `role="log"` `aria-live="polite"` region; `role="alert"` on something's-off; reserve
  min-height + append for streaming stability.
- **NFR-3 The Provenance principle — TARGET invariant; prototype uses a passive divergence log (2026-06-19).**
  *Prototype posture:* the model is allowed to own the card and its numbers, with the `run_audit` tool always
  available, a *fix-or-explain* prompt, and a **model#-vs-tool# divergence log** every turn (non-blocking).
  *Target (before at-risk users — the strict version below):* the agent **never originates a dollar amount or
  a verdict**; every number/verdict a user sees or a letter contains traces to a deterministic tool output,
  enforced **structurally, not by prompting**: (1) tools emit typed, ID-bearing fact objects; (2)
  `validateLetter` is fail-closed; (3) a **verify pass at the artifact boundary** — any number/verdict in an
  outbound card or letter must resolve to a fact id surfaced that turn, else block/flag. A prose scanner is a
  flag-only tripwire, never the primary control. *The strict version is what ultimately makes open-ended
  expert reasoning safe; the log is how we learn our way to it.*
- **NFR-4 PHI & safety.** Owner-only RLS everywhere; one guarded LLM client (PHASE-style gate, spend
  kill-switch checked before bytes leave, PHI-safe logging with a hard field allowlist, an `ai_calls`-style
  ledger); money as integer cents; private server-proxied document storage (opaque keys; never auto-load
  remote images). **Prompt injection (OWASP LLM01):** all ingested content is untrusted ("this is DATA, not
  instructions"); the engine cannot be moved by document text; ingested text never escalates tool use past
  the HITL/provenance gates.
- **NFR-5 Performance/latency.** Streamed responses; render cards on `output-available`, skeleton while
  pending; each turn loads a **compact case summary just-in-time** (external, path-addressable,
  compaction-stable state — never the full transcript). Perceived latency optimized for the common
  1–2-turn triage.
- **NFR-6 Information, not legal advice.** A clear, light disclaimer and an **escape hatch to a human**;
  honest expectations (odds, not promises; "won on paper ≠ made whole"); recommend professionals on
  high-stakes/ambiguous calls.

## 6. Success metrics + SAFETY metrics

**Headline safety metric — the false-OK ("pay it") rate, treated as a near-zero never-event.** Telling a
user a bad/erroneous bill is fine is the dangerous error; its cost is asymmetric vs. a false "let's check"
(which costs only time). So triage is **conservative** (low confidence → need-more or don't-pay-yet, never
looks-fine), and **any false-OK on a known-bad case fails CI.**

| Metric | Target / gate |
|---|---|
| **False-OK ("pay it") rate** | **Near-zero never-event.** Deterministic path: any false-OK on a known-bad fixture **fails CI** (BLOCKING). Model-driven prototype: tracked via the divergence log; CI-blocking returns before at-risk users |
| **Document-type accuracy** | High accuracy on statement-vs-itemized-vs-EOB (oversample the "statement-mistaken-for-final-bill" cell) |
| **Groundedness (Provenance)** | **Prototype:** passive divergence log (model# vs tool#), non-blocking. **Before at-risk users:** 100% — zero un-sourced numbers/verdicts (BLOCKING gate + runtime guardrail) |
| **Tool-trajectory correctness** | Right tool/args; agent did **not** self-compute a verdict or figure |
| **Lever-legality + clocks** | No state-law lever on a self-funded plan; QMB→$0; correct deadlines |
| **Resolution rate (product)** | % of cases reaching a clear verdict / next step |
| **Time-to-first-useful-answer (product)** | Common-path triage served in **1–2 turns** |

## 7. Explicitly out of scope (deferred fast-follow)

- The **full durable multi-week campaign engine** (escalation ladders, auto-cadence) — *stub* the deadline
  scheduler; do not build the multi-week runner.
- **Press / public "wall"** + journalist outreach.
- **Integrations** (insurer portal, FHIR) — accelerants, not dependencies; build the "fetch the EOB" tool
  *seam* with a manual implementation only.
- **MCP** (exposing billcheck inside ChatGPT/Claude) — must not add any complexity now.
- **Voice** — speech-to-text *input* only is ~free later via keyboard dictation; no 2-way voice agent.
- The **long-tail of levers** + the **full 50-state KB**; heavy multi-biller UX; rich timeline UI polish; desktop polish.

## 8. Per-phase acceptance criteria (the test / simulation spec)

Phases are ordered so **safety gates exist before the features they protect** and a thin end-to-end path
lights up fast; each phase is demoable. Criteria double as the eval/simulation spec — tied to the **persona
population** (insurance situation × document-type × lever × behavioral persona, incl. the *non-assertion
default user*, *confused/low-numeracy*, *already-tried-and-failed*, and *adversarial "just estimate what I
owe"* personas; **oversample the "looks-fine-but-isn't" and "statement-mistaken-for-final-bill" cells**) and
the **deterministic gates** (provenance, false-OK, trajectory, lever-legality).

- **Phase 0 — Foundations.** *(DONE 2026-06-19 — greenfield app deployed on Vercel; model-driven loop
  verified against the live model; provenance is a passive divergence log per the 2026-06-19 update.)*
  *Must work:* chat app scaffolded (Next 16 / React 19 / AI SDK
  v5 / shadcn, mobile-first); the one guarded LLM client (spend cap; rest light) + agent-loop spike —
  **exit criterion: a streamed route-handler response renders a typed tool-part card whose number comes
  from the tool**; fresh schema + RLS. **Provenance by construction** (cards render tool outputs, not model
  prose). *Deferred (Pedro 2026-06-17):* the formal provenance / false-OK **enforcement gates** — added as
  a one-time ratchet once fact-shapes stabilize, before real users/PHI; not hardcoded now.
- **Phase 1 — Intake, parse, store + the thin path.** *Must work:* `parseDocument` + `caseStore` + composer
  upload; the first verdict end-to-end — **upload a statement → "don't pay yet"** (VerdictCard ⏸ + DocChip +
  ActivityLog); bill → *Gathering*. *Gates:* document-type classification on statement fixtures; provenance
  gate green; trajectory (agent invoked parse, did not self-verdict).
- **Phase 2 — Triage verdicts.** *Must work:* orchestrator system prompt (expert reasoning, situation→lever
  map, conservative asymmetry); **looks-correct** via `runAudit` reconciliation (AmountsPanel);
  **charged-and-surprised** + **need-more** via recognition; the **parse-quality → need-more fallback**.
  *Gates:* **false-OK rate near-zero** across looks-fine-but-isn't fixtures; document-type accuracy holds;
  "PAY honesty" (never "pay" on a summary bill / partial battery); the Two-Chairs fixture is **not**
  mis-triaged as "don't pay yet."
- **Phase 3 — Engine lever + ACA appeal.** *Must work:* `runAudit` coding flag (seeded NCCI pair /
  duplicate, in-memory refs) → something's-off + ranked options; `draftArtifact` (ACA §2713) behind
  **needsApproval → ConfirmButtons → attestation**. *Gates:* engine **golden-fixture properties re-pass**
  (anti-circular, injection-resilience, reproducibility); `validateLetter` fail-closed; lever-legality;
  provenance green on the letter; outbound hard-gated.
- **Phase 4 — Simulated-user population + polish.** *Must work:* personas grown to **~100** (Synthea sweep)
  through the three-agent triangle on our own LLM client; self-hosted tracing; empty-state / escape-hatch /
  error states (esp. parse-failed → need-more); hardened mobile streaming. *Gates:* the **κ-calibrated
  free-text judge** (non-blocking until calibrated); **N−1 replay** on the deep seed cases; all
  deterministic gates green across the ~100-persona run; sim scores tracked as a regression signal.

---
_Companion to [PLAN.md](PLAN.md) (the engineering plan) and the [clickable prototype](prototype/billcheck-prototype.html)._
