# billcheck — Product

> **Status: HISTORICAL (V0) for the linear flow & verdict mechanics; the problem framing + honesty principles are evergreen.** v2 reframes the product per [RETHINK](RETHINK-2026-06-15-agentic-architecture.md). · _classified 2026-06-16_

## The problem

Medical bills are wrong constantly and people pay them anyway, because they
can't tell a legitimate charge from an error and don't know what leverage they
have. The two questions a patient actually has are: **do I owe this?** and
**if not, what do I do about it?** billcheck answers both with evidence.

## What it does

1. **Read the bill.** Upload a photo or PDF; we extract every line (code,
   description, units, charge) and the printed total.
2. **Ask what matters.** A short triage: insured or self-pay, has insurance
   processed it, collections, denial, already paid, a Good Faith Estimate.
   "Not sure" is always allowed and never blocks the audit.
3. **Audit deterministically.** A versioned engine runs every applicable check
   over the typed line items + reference data. No LLM decides anything here.
4. **Give an honest verdict.** A router turns the findings + coverage + triage
   into one primary verdict plus stacked tracks, ordered by legal deadline.
5. **Help act.** Generate the right artifact — dispute letter, debt-validation
   demand, itemized-bill request, financial-assistance checklist, federal
   dispute (PPDR) walkthrough — with paste-ready or printable delivery.
6. **Close the loop.** "I sent it," self-report an outcome, or upload a
   corrected statement → we verify the savings against a frozen baseline.

## The verdicts (D10 router)

Deterministic cascade — premise → status gates → fights → affordability → pay
gates. Verdicts **stack**: one primary + tracks ordered by statutory urgency
(FDCPA 30d > appeal 60–180d > PPDR 120d > FAP 240d).

| Verdict | Meaning |
|---|---|
| **REJECT** | The bill's premise is wrong (e.g. a documented payment isn't credited). |
| **WAIT** | Insured but not yet adjudicated — don't pay until the EOB lands. |
| **VALIDATE** | A collector is involved — demand debt validation (30-day clock). |
| **APPEAL** | Insurance denied a claim — appeal the denial (the bigger lever). |
| **CONTEST** | The audit found citable billing errors worth disputing. |
| **REDUCE** | Likely eligible for the hospital's financial-assistance policy. |
| **NEGOTIATE** | No errors, but prices run far above the Medicare benchmark. |
| **GET_ITEMIZED** | A summary bill — get the itemized version before auditing. |
| **PAY** | Itemized bill, full check battery ran, nothing to dispute. |
| **CLEAN_PARTIAL** | Nothing found in the checks we *could* run — honestly *not* the same as "clean." |

## The check battery

Deterministic checks (`packages/engine`). Each finding stamps the per-table
reference version it used.

| Check | What | Notes |
|---|---|---|
| C1 | Balance billing: bill vs EOB patient-responsibility | pure arithmetic — the most winnable class |
| C2 | Insurance never billed | insured + no EOB + no adjustments |
| C3 | Duplicate charges | same code/date/document |
| C4 | NCCI unbundled procedure pairs | |
| C5 | MUE — implausible units | |
| C6 | CARC provider-writeoff codes on the EOB | you're not liable for those adjustments |
| C8 | Good Faith Estimate breach (> $400) | No Surprises Act / PPDR trigger |
| C9 | Financial-assistance eligibility | income band vs published thresholds |
| C10 | Medicare-multiple **anchor** (≥4×) | leverage, **never** an "error" or a dollar claim |
| C13 | Payments not credited | receipts vs bill credits |

(C7/C11/C12 — timely-filing, records-based, upcoding — are V1.)

## Honesty principles (non-negotiable, enforced by tests)

- **Never claim savings we haven't verified.** C9/C10 carry no dollar amount —
  they're leverage, not money owed. Verified savings come only from a
  corrected-statement diff against a frozen baseline, with anti-phantom gates
  (a re-photo of the same bill mints nothing).
- **Never imply we checked more than we did.** A partial battery that finds
  nothing is `CLEAN_PARTIAL` ("no issues in the N checks we could run"), never
  "this bill checks out." The coverage screen shows exactly what ran, skipped,
  or isn't built yet.
- **PAY is earned, not defaulted.** It requires an itemized bill, the core
  battery all run, and zero findings. Summary bills never reach PAY.
- **The verdict is deterministic.** No LLM creates, suppresses, or rescores a
  finding. Document text is untrusted data; the engine sees only typed fields.
- **Evidence-gated artifacts.** A debt-validation letter needs the actual
  collection notice; an appeal needs the denial. We don't generate rights we
  can't substantiate.

## Monetization

**Free to know, pay to act, tip on the win.** The audit and verdict are free.
Pay-what-you-want after a successful outcome:

- **Verified savings** (corrected statement diffed to a frozen baseline) →
  anchored ask ("you saved $X", suggested ≈10%).
- **Self-reported win** → unanchored tip ask, *no* dollar claim, plus an
  upload-to-verify nudge.

$0 is always allowed; framing is prosocial, never a paywall. (Execution fees
for fax/certified mail/voice and a B2B advocate tier are later — see ROADMAP.)

## Privacy & safety posture

- **PHASE gate:** before a Business Associate Agreement is in place, document-
  bearing LLM calls require a flagged test account and fail closed. Production
  stays in this mode until the HIPAA/BAA preconditions are met.
- **PHI discipline:** a field-allowlist logger (never raw errors), full LLM
  I/O on an RLS-protected `ai_calls` ledger (never logs), case IDs only in
  workflow payloads, no PHI in URLs.
- **Anonymous-first:** start without an account; data purges after 30 days
  unless you claim it; claiming into an existing email requires that owner to
  authenticate.
- **Spend alarm:** a rolling cost ceiling pauses document-bearing LLM calls if
  tripped — a runaway-cost backstop ahead of the public funnel.

## Competitive position

White space confirmed (Jun 2026): no consumer product combines payer-EOB
reconciliation **and** clinical-record verification with a published, testable
methodology. Granted Health (closest, funded) is consumer audit + advocates
but iOS-only with no published method; Goodbill/Avelis moved upstream to B2B.
billcheck's moats: a deterministic, reproducible engine; honest coverage; and
a methodology we can show. Full brief in the gtm-pedro workspace.
