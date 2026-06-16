# US Medical-Bill Problem Taxonomy — research pass for billcheck v2

> **Status: INPUT (v2).** Problem-space research feeding the v2 brainstorm — fulfills the knowledge-base research pass in [RETHINK §6](../RETHINK-2026-06-15-agentic-architecture.md). · _classified 2026-06-16_

**Date:** 2026-06-16 · **Purpose:** map the landscape of medical-bill problems a US
patient can face, to fuel the v2 brainstorm. **Scope:** US only, patient/consumer
side (not hospital revenue-cycle), current through mid-2026.

**Method:** parallel deep-research fan-out (web search → fetch → adversarial
verification of load-bearing stats → synthesis). Sources prioritized: federal
agencies (CMS, OIG, GAO, CFPB, IRS, HHS), KFF/Peterson-KFF, peer-reviewed
journals (Health Affairs, JAMA, NBER), then reputable journalism; vendor/advocate
content catalogued but tagged.

> **How to read the numbers.** Two very different things get called "error rates."
> (1) *Improper-payment* rates (CMS CERT/PERM) are measured from the **payer's**
> side and are dominated by *missing paperwork*, not patient overcharges. (2)
> *Consumer* error rates (advocacy groups, surveys) measure bills patients dispute.
> billcheck must never conflate them. See §2.

---

## 1. TL;DR — what to carry into the brainstorm

1. **The problem space is a finite set of "situations," not a blob.** A patient is
   in one (or more) of ~20 recognizable situations, and each has a *signal*, a
   *confirming artifact*, a *lever*, a *legal hook*, and a *deadline*. That maps
   almost 1:1 onto an orchestrator-picks-tools architecture (§8).
2. **The famous "80% of medical bills contain errors" is not a real number** — it
   traces to a billing-advocacy firm reviewing self-selected disputed bills, not a
   study. Defensible numbers are much lower and more nuanced (§2). This *gap* is a
   positioning opportunity: billcheck wins on honesty where the category lies.
3. **The most winnable consumer situations are not the "coding error" ones.** The
   highest leverage-per-effort lives in: **balance-billing / EOB reconciliation**
   (pure arithmetic), **claim denials → appeal** (~19% of ACA in-network claims
   denied; ~50%+ overturned when appealed, but <1% are appealed), **"don't pay yet"
   (not adjudicated)**, the **itemized-bill request** (a HIPAA right that unlocks
   everything else), **charity care / IRS 501(r)**, and **GFE/PPDR for self-pay**.
4. **When patients DO dispute, they usually win.** ~74% who contact the billing
   office get the error corrected; ~76% who flag an unaffordable bill get relief;
   most disputes take <1 hour (USC Schaeffer / *JAMA Health Forum*, 2024). The
   barrier is knowledge and activation energy — exactly what an agent removes.
5. **There is no single authoritative consumer-facing taxonomy** to copy (§7). The
   space is fragmented across CFPB, KFF, FAIR Health, Dollar For, Patient Advocate
   Foundation, NSA/CMS, and vendor checklists. billcheck building a rigorous,
   maintained one is itself a differentiator.
6. **Watch the moving legal pieces:** the CFPB rule removing medical debt from
   credit reports was **finalized Jan 2025 and then VACATED by a federal court in
   July 2025** — not in force in 2026 (§6). The NSA **Advanced EOB for insured
   patients is still not enforced** (§5). Don't hard-code either as live.

---

## 2. The "80% of bills have errors" myth — and the honest numbers

**Verdict: directionally "errors are common," but the 80% figure is not a
scientific finding.** Use the honest framing below.

- **Origin of "80%":** Medical Billing Advocates of America (MBAA; CEO Pat Palmer),
  popularized by a 2016 *Becker's Hospital Review* piece. CoPatient cited a similar
  number. Both are **self-selected samples** — bills patients already suspected were
  wrong. Classic survivorship/selection bias. [Becker's/MBAA](https://www.beckershospitalreview.com/finance/medical-billing-errors-growing-says-medical-billing-advocates-of-america/)
- **Counter-estimate:** Prof. Stephan Parente (Univ. of Minnesota) put the
  population error rate nearer **30–40%** (USA Today, 2012).
- **Government gold standard (payer side):** CMS **CERT** Medicare FFS improper-payment
  rate is **6.55% (FY2025, $28.8B)**, **7.66% (FY2024, $31.7B)**, 7.38% (FY2023) —
  from a ~50,000-claim random sample. *But* ~**63–68% of those "improper payments"
  are insufficient/no documentation**, ~27% medical-necessity, and only ~**1%
  incorrect coding overall** (higher for E/M specifically, ~49% of E/M errors).
  [CMS FY2024 Fact Sheet](https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2024-improper-payments-fact-sheet) ·
  [CMS CERT](https://www.cms.gov/data-research/monitoring-programs/improper-payment-measurement-programs/comprehensive-error-rate-testing-cert)
  → **Improper payment ≠ "you were overcharged."**
- **Honest consumer-side numbers:**
  - **~1 in 5 (20%)** US adults recently got a bill they disagreed with or couldn't
    afford; of those who contacted the billing office (61.5%), **~74% got the error
    corrected or got relief**; most disputes took **<1 hour** (USC Schaeffer /
    *JAMA Health Forum*, Aug 2024). [USC Schaeffer](https://schaeffer.usc.edu/research/challenging-medical-bills-cost-study/) · [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11364993/)
  - **43% of all adults / 53% with health-care debt** believe they've received a
    bill with an error (KFF "Diagnosis: Debt," 2022). [KFF](https://kffhealthnews.org/diagnosis-debt/)
  - **45% of insured adults** got a bill for something they thought was covered;
    **17%** were denied a doctor-recommended service (Commonwealth Fund, Aug 2024). [Commonwealth Fund](https://www.commonwealthfund.org/)
  - CFPB complaint data: **>4 in 10** with medical debt reported an **inaccurate
    bill**; **~7 in 10** were asked to pay something **insurance should have covered**
    (skews toward complainants). [CFPB → CA Legislature](https://www.consumerfinance.gov/about-us/newsroom/cfpb-letter-to-california-state-legislature-on-barring-medical-bills-on-credit-reports/)

**billcheck framing to adopt:** "Most bills aren't outright fraudulent — but a
large minority have a real problem, and when patients push back they usually win.
We'll tell you, honestly, whether *yours* has a defensible issue." Never cite 80%.

---

## 3. The taxonomy — patient situations, by family

For each: **what** · **prevalence/who** · **lever + legal hook + deadline.**

### Family A — Billing & coding errors (the charge itself is wrong)

| # | Situation | What it is | Prevalence / who | Lever · hook · deadline |
|---|---|---|---|---|
| A1 | **Balance billing (non-surprise)** | Provider bills patient the gap between charge and the plan's allowed amount on a covered, in-network claim | Insured; the single most winnable class (pure arithmetic vs. EOB) | Compare bill to EOB "patient responsibility"; in-network contracts forbid the balance → call/dispute; state insurance commissioner |
| A2 | **Duplicate charges** | Same service/line billed twice (same or different dates) | All payers; common, easy to prove | Itemized bill → flag dup → provider billing office correction |
| A3 | **Unbundling (NCCI)** | Components billed separately that should be one bundled code; modifier 59/25 abuse | Provider-side; OIG/DOJ enforce heavily, but hard for a consumer to see without codes | Itemized bill + NCCI PTP edits; mostly a payer fight, not patient — frame as leverage |
| A4 | **Upcoding** | Higher-intensity code than service delivered (e.g., 99214 vs 99213; highest-severity DRG) | Large & quantified at system level ($14.6B/yr, Health Affairs 2024); hard for a patient to adjudicate alone | Compare visit complexity to records; appeal/dispute; usually needs records |
| A5 | **Excess units (MUE)** | Units billed exceed CMS Medically Unlikely Edit max | Niche but checkable with the MUE tables | Itemized bill + MUE table; Medicare appeal (~28% of MUE denials overturned) |
| A6 | **Services not received / phantom** | Billed for items/visits/tests never delivered | Largest single category of *provider fraud*; for a patient, the most intuitive dispute | "I didn't receive this" → itemized bill → dispute; report to payer/OIG |
| A7 | **Wrong/mismatched codes** | CPT/HCPCS/revenue/ICD errors causing wrong liability or denial | Pervasive; drives many denials (CO-11 dx/proc mismatch) | Itemized bill + EOB; corrected claim resubmission |
| A8 | **No itemization (summary bill)** | Lump categories ("pharmacy," "lab"), no line detail | Extremely common first artifact | **Right to itemized bill — HIPAA 45 CFR §164.524, ≤30 days** (gates every other check) |

**Key prevalence anchors (defensible):** CERT 6.55–7.66% improper (mostly
documentation); E/M incorrect-coding ~49% of E/M errors; CPT 99214 ~$459M and
99233 >$490M improper (FY2024); upcoding ≈ **$14.6B excess hospital payments in
2019** (RAND/*Health Affairs* 2024, [doi](https://www.healthaffairs.org/doi/10.1377/hlthaff.2024.00596)); MA risk-adjustment
upcoding ≈ **$40–54B/yr** (MedPAC/OIG). These are mostly **payer-side** — useful
for "the system is leaky," not as "your bill is X% likely wrong."

### Family B — Insurance & coverage problems

| # | Situation | What it is | Prevalence / who | Lever · hook · deadline |
|---|---|---|---|---|
| B1 | **Not yet adjudicated** | Patient billed before insurer's EOB lands | Insured; very common, high-trust "don't pay yet" moment | Wait for EOB; bill should match EOB patient-responsibility |
| B2 | **Claim denied** | Insurer denied a covered service | **~19% of in-network ACA claims denied (KFF 2024)**; <1% appealed; **~50%+ overturned when appealed** | **Internal appeal (180 days) → external/independent review** (ACA §2719 / state) |
| B3 | **Claim never submitted** | Provider billed patient without billing insurer | Insured | Make provider submit to payer first |
| B4 | **Surprise / out-of-network (NSA)** | OON provider at in-network facility, or emergency | Insured (not Medicare/Medicaid/self-pay) | **No Surprises Act**: balance billing banned for ER, ancillary at in-network facility, air ambulance; cost-share at in-network QPA. **Ground ambulance EXCLUDED** (§5) |
| B5 | **Prior-auth / medical-necessity denial** | Care denied for lack of PA or "not necessary" | Common denial reasons (PA ~9%, med-nec ~5%; "administrative/other" ~77%) | Appeal with clinical documentation; peer-to-peer |
| B6 | **Coordination-of-benefits error** | Two plans, wrong primary, double-charge | Dual-coverage patients | Fix COB order with payers |

**Denial-reason mix (2024):** administrative/process ~77%, prior-auth/referral ~9%,
medical necessity ~5%, the rest coding/eligibility. (KFF/MDaudit/Experian — mix of
authoritative + industry.) **Appeal economics are the headline**: huge denial
volume, tiny appeal rate, high win rate → a prime billcheck wedge.

### Family C — Pricing & affordability (charge may be "valid" but excessive/relievable)

| # | Situation | What it is | Prevalence / who | Lever · hook · deadline |
|---|---|---|---|---|
| C1 | **Price far above benchmark** | Chargemaster >> Medicare/negotiated rate | Self-pay & OON especially; commercial plans paid hospitals **254% of Medicare** on average (RAND 2024, 2022 data; outpatient 279%) | Medicare-multiple as a **negotiation anchor** (never an "error"/$ claim); Hospital Price Transparency files (45 CFR Part 180; ~46% of hospitals non-compliant per OIG 2024) + FAIR Health |
| C2 | **Charity care / FAP not offered** | Nonprofit hospital didn't screen patient for financial assistance | **~$14B/yr** in owed charity care never provided (Dollar For 2024); only **29%** of patients who can't afford a bill obtain it; **52%** got no info from the hospital | **IRS §501(r)**: FAP required; **application window ≥240 days** from first post-discharge bill; **AGB limit** (can't charge FAP-eligible more than insured rates); no extraordinary collection actions before FAP-eligibility determination + 30-day notice |
| C3 | **Self-pay GFE breach** | Final self-pay bill exceeds Good Faith Estimate by ≥$400 | Uninsured/self-pay (enforced since 2022) | **NSA PPDR**: dispute within **120 days**, **$25** fee (refunded if you win), collections paused during dispute |

> **Charity care is arguably the biggest under-claimed lever.** Nonprofit hospitals
> get ~$25.7B/yr in tax breaks (Lown Institute, FY21 — methodology disputed by AHA)
> yet leave ~$14B/yr in owed charity care unprovided (Dollar For). The lever is
> strong and statutory (501(r)); the failure is that patients are never screened.
> An agent that detects nonprofit status + income band and auto-drafts the FAP
> application is high-impact. (Dollar For runs a free FAP service + DB — possible partner.)

### Family D — Debt, collections, credit & legal

| # | Situation | What it is | Prevalence / who | Lever · hook · deadline |
|---|---|---|---|---|
| D1 | **In collections** | Bill sold/assigned to a debt collector | ~$88B medical debt on credit reports (CFPB 2023) | **FDCPA debt validation**: demand validation; **Reg F**; collector must substantiate. Dispute in writing |
| D2 | **On credit report** | Medical collection reported to bureaus | Historically 1-in-5 reports | **Voluntary bureau changes still in force** (paid medical collections removed; 1-yr wait; **<$500 not reported**, 2022–23). **CFPB rule banning medical debt entirely: finalized Jan 2025 → VACATED by E.D. Texas, July 2025 → NOT in force 2026** |
| D3 | **Statute of limitations** | Debt too old to sue on (varies by state) | All; state-specific | Assert SOL; don't "restart the clock" by paying — *(thin in this pass; deepen per-state)* |
| D4 | **Missed deadline risk** | Appeal/dispute clocks running | All | The cross-cutting "clock" map (§4) |

---

## 4. The levers & deadlines map (cross-cutting — the orchestrator's "clock" table)

| Lever | Who it's for | Legal hook | Clock |
|---|---|---|---|
| Request itemized bill | Anyone | HIPAA 45 CFR §164.524 | Provider responds **≤30 days** (one 30-day ext.) |
| EOB reconciliation / balance-bill dispute | Insured | Plan contract; state law | No fixed federal clock; before collections |
| Internal appeal of denial | Insured | ACA §2719 / ERISA | **180 days** from denial |
| External review | Insured | ACA §2719 / state | Typically **4 months** after internal |
| No Surprises Act protection | Insured (ER/ancillary/air amb.) | NSA; 45 CFR Part 149 | Applies automatically; complaint line |
| NSA PPDR (self-pay GFE breach ≥$400) | Uninsured/self-pay | NSA §2799B-7 | File **≤120 days** of bill; $25 fee |
| Charity care / FAP | Low/mid income | IRS §501(r) | Apply **≥240 days** from 1st bill |
| FDCPA debt validation | In collections | FDCPA / Reg F | Dispute window after first contact |
| Medicare claim appeal (5 levels) | Medicare FFS | SSA | Redetermination **120 days**, then 180/60/60/60 |

This table *is* a deterministic tool: given (situation, dates), compute live
deadlines. Strong candidate for a v2 "tool."

---

## 5. No Surprises Act — what's covered vs not (2026 status)

- **Banned (cost-share at in-network QPA):** emergency services (any facility);
  ancillary services by OON providers at in-network facilities — anesthesiology,
  radiology, pathology, neonatology, ER, assistant surgeons, hospitalists,
  intensivists, diagnostics/lab (these **cannot** be waived); **air ambulance**.
- **NOT covered:** **ground ambulance** (explicit exclusion; ~22 states have partial
  laws), OON care at OON facilities, non-covered services, and self-pay (gets GFE +
  PPDR instead, not a balance-billing ban). Medicare/Medicaid/VA/TRICARE have their
  own regimes.
- **Self-pay GFE: enforced since 2022.** **Advanced EOB for *insured* patients: still
  NOT enforced** as of mid-2026 (deferred; possible ~Aug 2026). Don't assume it's live.
- **QPA methodology in flux** (TMA litigation; 5th Cir. en banc 2025) — affects payer
  cost-share math, not the patient's balance-billing protection.
- Refs: [45 CFR Part 149](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149) ·
  [CMS Key Protections](https://www.cms.gov/files/document/nsa-keyprotections.pdf) ·
  PHSA §§2799A-1, 2799B-6/7 (42 U.S.C. §300gg-111 et seq.).

---

## 6. Medical debt & credit reporting — current status (time-sensitive)

- **In force:** voluntary nationwide credit-bureau changes (Equifax/Experian/
  TransUnion): removed **paid** medical collections; **1-year wait** before any
  medical collection appears; medical collections **under $500 not reported**
  (2022–2023).
- **NOT in force:** the **CFPB final rule** (Reg V) to remove **all** medical debt
  from credit reports and bar its use in underwriting — **finalized Jan 14, 2025**,
  then **vacated by the U.S. District Court for the Eastern District of Texas in
  July 2025**; **not enforceable as of mid-2026.** [Fed. Reg. rule](https://www.federalregister.gov/documents/2025/01/14/2024-30824/prohibition-on-creditors-and-consumer-reporting-agencies-concerning-medical-information-regulation-v)
- **State laws in flux:** ~**15 states** (CA, CO, NY, etc.) independently bar medical
  debt on credit reports — but in **Oct 2025 the CFPB issued an interpretive rule
  asserting the FCRA preempts those state laws**, and industry (ACA International) is
  now suing to block them (e.g., Colorado, Nov 2025). Preemption is **unresolved/
  litigated** as of mid-2026 — earlier courts (ME, NJ) went the other way. Treat
  "medical debt won't appear on your credit report" as **state-specific and unsettled.**
- **Scale:** ~**$88B** medical debt on credit reports (CFPB 2021 data, pre-bureau-changes;
  ~$49B after); ~100M Americans carry health-care debt (KFF); post-2023 only ~5% of
  adults still have medical collections on file (down from ~12%, Urban Institute).
- **Implication:** any billcheck copy about "medical debt won't hurt your credit"
  must be state-aware and must not assume the federal rule. Treat as a live-config
  fact, not a constant.

---

## 7. Existing taxonomies / frameworks — has anyone mapped this? (answers the core question)

**Short answer: partially, and fragmented. No single authoritative, maintained,
consumer-facing "what situation am I in → what do I do" decision model exists.**
Best references to build from:

| Source | Covers | Structured taxonomy? | Use to billcheck |
|---|---|---|---|
| **CFPB** (reports, complaint data, consumer guides) | Debt, collections, credit, inaccurate-bill prevalence | Partial (problem categories, not decision logic) | **High** — authoritative prevalence + rights framing |
| **KFF / Peterson-KFF** ("Diagnosis: Debt", denial studies) | Debt scale, denial rates, billing-error perception | No (research, not a how-to map) | **High** — best prevalence stats |
| **FAIR Health Consumer** | Cost benchmarking by CPT + ZIP; "review your bill" guide | Partial (price tool + checklist) | **High** — benchmark tool + step guides |
| **Dollar For** | Charity care / 501(r) eligibility + filing | Deep but **single-lever** (charity care only) | **High** for C2; narrow |
| **Patient Advocate Foundation** | Case mgmt: denials, debt, billing | Casework categories, not a public taxonomy | Medium |
| **NSA / CMS "medical bill rights"** | Surprise billing, GFE, PPDR | Yes, but **scoped to NSA** | High within scope |
| **Vendor checklists** (Goodbill, Resolve, MBAA, AARP, Nolo, "Never Pay the First Bill") | "Top N billing errors," how-to-dispute | Lists/anecdotes, not decision logic; some marketing-grade | Medium — UX/explainer inspiration; verify claims |
| **Academic** (Health Affairs, JAMA, NBER, scoping reviews) | Upcoding/denials/fraud prevalence | Rigorous but topical, not a consumer map | High for credibility |

**Two references worth standing on (closest to a real model):**
- **CMS "Medical Bill Rights" action-plan tool** ([cms.gov/medical-bill-rights/help/plan](https://www.cms.gov/medical-bill-rights/help/plan)) — the *only* source built from patient-centered UX research (90+ hrs) with genuine **situation-branching** (denied claim / unsure if in-network / care with Medicare / billed while uninsured / can't pay / planning care). Right *structure*, but scope is shallow on errors, charity care, and collections. Use as the structural skeleton.
- **NY AG Health Care Bureau annual report** — the best **empirical category taxonomy** with frequencies: provider billing ~42%, wrongful practices ~24%, claims processing ~13%, then denials / coverage / Rx. Use to sanity-check that our taxonomy covers where the real mass of complaints sits.

**So the opportunity:** no one has published a *rigorous, maintained, end-to-end*
situation→lever→deadline taxonomy. billcheck can own that (essentially §3+§4) — it's
both the product's brain (the orchestrator's situation model) and a credibility asset.
Build from the CMS skeleton + NY AG categories + Marshall Allen's *Never Pay the First
Bill* (remediation strategies) + Dollar For (charity-care branch) + CFPB (collections branch).

---

## 8. Strategic implications for billcheck v2 (orchestrator + tools)

1. **The taxonomy is the orchestrator's situation model.** Each row in §3 = a
   *situation* with: a detection **signal** (what to notice on bill/EOB/triage), a
   **confirming artifact** (itemized bill, EOB, GFE, denial letter, collection
   notice), a **lever**, a **legal hook**, a **deadline**. The agent's job: figure
   out which situation(s) apply and gather the right artifact. The tools' job:
   compute and cite.
2. **What stays deterministic (tools), per Pedro's framing:** the arithmetic
   (balance-bill overage, duplicate detection, Medicare-multiple anchor, savings
   diff), the rules tables (NCCI/MUE), the eligibility thresholds (501(r) income
   bands), and the **deadline calculator** (§4). The agent calls these; it never
   invents a dollar figure or a verdict.
3. **What's conversation/judgment:** triage to the right situation, deciding which
   document to ask for next, explaining options, drafting the letter/appeal. This is
   where chat/voice earns its keep — and where V0's rigid linear flow failed.
4. **Re-rank the roadmap by consumer leverage, not by "coolest check."** Highest
   leverage-per-effort: **B1 don't-pay-yet**, **A1/EOB reconciliation**, **A8
   itemized-bill request (gateway)**, **B2 denials→appeal**, **C2 charity care**,
   **C3 GFE/PPDR**, **D1 FDCPA validation**. Classic coding-error checks (A3/A4/A5)
   are real but mostly payer-side and need codes the patient often doesn't have —
   keep them, but as *leverage*, not the headline. **Note:** denials→appeal was
   APPEAL-routing-only in V0; the data (huge volume, tiny appeal rate, ~50%+ win)
   argues for making it a first-class, agent-assisted flow in v2.
5. **Honesty is the moat — and the category invites dishonesty.** The "80%" myth and
   the "improper payment ≠ overcharge" trap are everywhere. billcheck's defensible
   line: claim only what an artifact substantiates; "we found a *defensible* issue,"
   not "your bill is wrong"; verified savings only via corrected-statement diff. The
   honest-numbers in §2 are good marketing copy *because* they're true.
6. **Treat legal facts as live config, not constants.** Credit-reporting rules (§6),
   NSA AEOB enforcement (§5), QPA methodology, and state laws are all in motion in
   2026. The knowledge base needs dated, versioned facts (mirrors V0's
   versioned-reference discipline — that pattern carries over).

---

## 9. Confidence & gaps in this pass

- **High confidence:** the 80%-myth debunk; CERT/PERM improper-payment figures and
  their documentation caveat; NSA scope + GFE/PPDR mechanics; HIPAA itemized-bill
  right; CFPB credit-rule vacatur; denial rates + appeal economics; itemized-bill /
  EOB distinction.
- **Now well-sourced** (filled this pass): 501(r) charity-care prevalence (Dollar For
  $14B gap; 29% obtain it); commercial-vs-Medicare price multiples (RAND 254%); credit-
  reporting status incl. the Oct-2025 FCRA-preemption fight; FDCPA/Reg F + state SOL.
- **Still thin — deepen before relying:** a clean per-payer (commercial vs MA vs
  Medicaid vs self-funded ERISA) denial-reason breakdown; consumer-side (not payer-side)
  prevalence of specific coding errors on *patient* bills.
- **Provider-side vs patient-side:** much of the richest data (OIG/DOJ/GAO upcoding,
  unbundling, MUE, $B fraud takedowns) is **payer/enforcement** data. It proves the
  system is leaky and is great credibility material, but it is **not** a direct
  estimate of "your bill is wrong" — keep that distinction in all copy.

---

## 10. Selected sources (authoritative first)

- CMS CERT improper payments — [program](https://www.cms.gov/data-research/monitoring-programs/improper-payment-measurement-programs/comprehensive-error-rate-testing-cert) · [FY2024 fact sheet](https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2024-improper-payments-fact-sheet) · [FY2025 fact sheet](https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2025-improper-payments-fact-sheet)
- No Surprises Act — [45 CFR Part 149 (eCFR)](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149) · [CMS key protections](https://www.cms.gov/files/document/nsa-keyprotections.pdf) · [CMS medical bill rights](https://www.cms.gov/medical-bill-rights)
- HIPAA right of access (itemized bill) — [45 CFR §164.524 (eCFR)](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524) · [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html)
- Hospital Price Transparency — [45 CFR Part 180](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-E/part-180) · [CMS](https://www.cms.gov/hospital-price-transparency)
- CFPB medical debt — [$88B on credit reports](https://www.consumerfinance.gov/about-us/newsroom/cfpb-estimates-88-billion-in-medical-bills-on-credit-reports/) · [Reg V rule (vacated)](https://www.federalregister.gov/documents/2025/01/14/2024-30824/prohibition-on-creditors-and-consumer-reporting-agencies-concerning-medical-information-regulation-v)
- KFF — ["Diagnosis: Debt"](https://kffhealthnews.org/diagnosis-debt/) · [ACA claims denials 2024](https://www.kff.org/patient-consumer-protections/claims-denials-and-appeals-in-aca-marketplace-plans-in-2024/)
- USC Schaeffer / *JAMA Health Forum* (2024) — challenging medical bills — [study](https://schaeffer.usc.edu/research/challenging-medical-bills-cost-study/) · [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11364993/)
- Upcoding — RAND/*Health Affairs* 2024 [doi](https://www.healthaffairs.org/doi/10.1377/hlthaff.2024.00596) · "Upcoding in Medicare: where does it matter most?" [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10759668/) · MedPAC MA status report
- The "80%" origin — [Becker's/MBAA](https://www.beckershospitalreview.com/finance/medical-billing-errors-growing-says-medical-billing-advocates-of-america/)
- CMS NCCI / MUE — [NCCI](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits) · [MUE tables](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits-mues)
- FAIR Health Consumer — [cost lookup + bill review](https://www.fairhealthconsumer.org/)
- Dollar For (charity care) · Patient Advocate Foundation — [patientadvocate.org](https://www.patientadvocate.org/)

*(Full per-claim source lists with quality tags are preserved in the research
agents' transcripts; this is the curated, decision-relevant subset.)*
