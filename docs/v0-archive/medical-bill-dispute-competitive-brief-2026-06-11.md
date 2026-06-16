# Medical Bill Dispute App — Competitive & Feasibility Brief

**Date:** 2026-06-11
**Concept:** Consumer app that helps people decide whether a medical bill is legitimate and accurate (pay vs. contest), then helps them contest it. Planned architecture: bill upload (OCR/LLM) + EOB reconciliation via payer Patient Access APIs + Epic/EHR clinical-record verification ("did this billed service actually happen") + price-transparency benchmarks + automated dispute letters / charity-care applications / NSA-GFE disputes.
**Method:** Deep-research workflow (109 agents, 26 sources fetched, 25 claims adversarially verified 25-0) + 3 targeted follow-up research agents for gaps. All company facts verified against live sites and 2025–2026 press, June 11, 2026.

---

## TL;DR

1. **The white space is real — and it has a warning label.** No consumer product combines payer EOB reconciliation with clinical-record verification. But two capable teams validated the consumer lane and walked away from it (Avelis pivoted to B2B after erasing $300K for 60 patients in 5 months; Goodbill is drifting to plans/TPAs). The empty space is more likely an economics problem (CAC, episodic use, fee collection) than an idea problem.
2. **The EOB half of the architecture only reaches ~35–45% of insured Americans today.** Payer Patient Access APIs are mandated only for Medicare Advantage, Medicaid managed care, CHIP, and ACA exchange plans. Self-funded employer plans (~100M people — the prime demographic) have no API mandate and none coming. The clinical half, by contrast, is universal (Epic patient APIs + TEFCA IAS work regardless of payer).
3. **This inverts the build order:** clinical-record verification + benchmarks + dispute letters work for everyone; EOB reconciliation is a segment feature, not the foundation.
4. **PWYW can work here but only anchored and framed.** Field evidence: pure PWYW collapses to ~$0.92 mean payment; prosocial framing lifts it 6x. Recommendation: suggested-payment anchor tied to savings, with conventional contingency as the durable fallback.
5. **Novellia is a latent competitor / natural partner-or-acquirer, not a current rival.** $18M Series A closed June 2, 2026 ($28M total). They own the consumer clinical-record pipes but do nothing bill-related and monetize via pharma data licensing. A bill-dispute feature would be a rational user-acquisition hook for them — watch this.

---

## (a) Landscape Table

| Company | Status (Jun 2026) | Lane | Pricing | Data connections | Clinical-record verification | Notes |
|---|---|---|---|---|---|---|
| **Goodbill** | Active; $5.3M raised; drifting B2B (plans/TPAs) | Hospital bill audit + negotiation | 20% of savings, capped $1,000, no-savings-no-fee | Hospital patient-portal integrations (2,500+ hospitals; Epic/Cerner/Allscripts); 3,500+ for charity-care screening. No payer APIs | **Yes** — only incumbent; human coders review record vs. charges | Closest analog. DTC now secondary on their own site |
| **Resolve Medical Bills** | Active | Negotiation (concierge) + charity-care filing | 25% of savings ($5–15K bills), 10% (>$15K); refundable $249–$499 deposit; no fee cap. "Easy File" flat-fee charity-care product | Manual/concierge | No | Proves charity-care filing is monetizable (flat fee) |
| **HealthLock** | Active; **loses Mastercard channel Mar 31, 2026** | Claims auditing + denial help + negotiation | $34.99/mo (or $335.88/yr) **plus** 20% shared-savings fee on recoveries | Linked insurance accounts + manual upload. No EHR/clinical | No — audits what was claimed, not what happened | Distribution hit incoming; subscription+contingency double-dip |
| **Avelis Health** | Active (YC S25, ~$330K ARR) — **pivoted away from consumer** | Payment integrity for self-insured employers/TPAs | B2B ("save 2–7% of plan spend") | Voice-AI record retrieval from providers; AI clinical validation | **Yes** — but payer-side | Started consumer ($300K erased, 60 patients, <5 months), chose B2B. Cautionary data point + latent re-entry risk |
| **Claimable** | Active, scaling; $10M raised (Mark Cuban et al.) | **Insurance denial appeals only** | Free (pharma-subsidized) or $39.95/appeal | Manual upload + curated knowledge base | No | TIME100 Health 2026; exploring class-action litigation division; 4 pharma contracts |
| **Dollar For** | Active nonprofit; budget-stressed (lost ~$500K of ~$1.5M budget in 2025) | **Charity care only** | Free | Manual income questionnaire | N/A | $151M+ debt erased cumulative; $55M in 2025 alone; owns charity-care mindshare |
| **Counterforce Health** | Active nonprofit (Durham NC, 5 people, $280K grants) | **Denial appeals only** | Free ("permanent") + provider-facing tools | Manual upload | No | ~20K patients helped; ~70–75% claimed success rate |
| **Fight Health Insurance** | Active, open-source (Holden Karau) | **Denial appeals only** | Free | Manual upload | No | "Totient" commercial arm could NOT be verified — treat as unconfirmed |
| **Sheer Health** | Active | **Closest consumer comp on the EOB side**: connects insurance accounts via credentials, explains EOBs, handles OON reimbursements | $40/mo or % of recovery | Insurance-portal credential connections (covers commercial plans incl. self-funded) | No | The credential-scraping approach is the workaround for the self-funded API gap |
| **Novellia** | Active; $18M Series A Jun 2, 2026 ($28M total; Spark, Khosla) | Consumer PHR; pharma data licensing | Free to consumers forever | 50,000+ providers (MyChart, Athena, Quest, VA); clinical only — no claims/EOB pipes | Has the records, doesn't audit bills | Zero bill-related features today; $28M earmarked for pharma data platform |

**Provider-side B2B wave (not consumer, but absorbing talent/capital):** Amperos Health ($16M Series A, Bessemer, Apr 2026 — provider denial management), Aegis (YC S25), Taiga, Clearest Health, Ruma Care. Most 2025–2026 entrants attack provider revenue cycle, not the consumer.

### Market structure read

The space has sorted into three lanes:
1. **Insurance denial appeals** — crowded and largely **free** (Claimable, Counterforce, Fight Health Insurance, Sheer adjacent). Do not build here.
2. **Charity care** — a free nonprofit (Dollar For) plus a monetized flat-fee filer (Resolve Easy File). Feature, not company.
3. **Provider bill audit / pay-vs-contest** — the thin lane. Goodbill (drifting B2B, human-coder-driven), Resolve (high-touch concierge). **No self-serve, automated, consumer-priced product exists here.** This is Pedro's lane.

---

## (b) White-Space Analysis (independent view)

**Verified gap:** No consumer product today combines (1) payer EOB reconciliation and (2) clinical-record verification in an automated pay-vs-contest decision tool. Goodbill covers the clinical half via hospital portals with human coders; Sheer covers the insurance-account half with no clinical check; everyone else is manual-upload denial appeals or charity care.

**Why is the space empty? (the load-bearing question)**
- Avelis's stated rationale for going upstream: fix bad payments before the patient sees a bill. Plausibly also: consumer CAC is high, need is episodic (you dispute 1–2 bills/year, then churn), and collecting contingency fees from financially stressed consumers is unpleasant.
- **The counter-thesis for building anyway:** the incumbents made their lane choices when bill auditing required human medical coders (Goodbill) or concierge labor (Resolve). LLM costs have collapsed the marginal cost of the audit itself since then. A fully automated triage ("here's what's wrong with your bill and here's the letter") has a cost structure none of these companies had when they chose B2B. The 2024 PWYW literature's "low cost structure" condition — which cuts against service businesses — actually favors an automated product.
- The episodic-use problem is real and unsolved. Mitigations: bill-monitoring subscription (HealthLock model), family accounts, or accepting transactional economics with near-zero marginal cost.

**Build-order inversion (key architectural finding):** The original concept assumed EOB-first. The data says flip it:
- **Universal (works for ~everyone):** bill upload + itemized-bill request + clinical-record verification (Epic patient APIs + TEFCA IAS are payer-agnostic) + price-transparency benchmarks + charity-care screening + GFE/PPDR disputes + dispute letters.
- **Segment-gated (~35–45% of insured):** EOB auto-reconciliation via payer APIs (MA, Medicaid MC, ACA). For everyone else: manual EOB upload or Sheer-style credential connections.
- The uninsured/self-pay PPDR flow ($400 over GFE, $25 filing fee, binding) needs **no payer data at all** and is documented as massively underused.

**ICP implication:** API-reachable populations skew 65+ (Medicare Advantage — high bill volume, time-rich), low-income (Medicaid — charity care more relevant than disputes), and individual-market ACA (high-deductible, motivated, tech-comfortable — likely best beachhead for the full reconciliation product). The commercially attractive employer-insured majority requires upload/credential paths.

---

## (c) The Novellia Angle

- **Today:** zero overlap. Site, features page, and the June 2 Series A release contain no mention of billing, claims, EOBs, or disputes. Their pipes are clinical-only — no payer/claims connectivity. Their $28M is explicitly earmarked for scaling the pharma data platform.
- **Their incentive structure matters:** every feature that motivates a patient to connect their records feeds the pharma data engine. A bill-dispute feature is a *rational* acquisition hook for them ("connect your records, we'll catch billing errors") — which makes them the most strategically logical latent competitor, and equally the most natural partner or acquirer for the clinical-verification half of this product.
- **Practical options:** (1) build on their rails if they open an API (nothing public today); (2) build independently and be their obvious tuck-in; (3) watch for them shipping anything billing-adjacent as the signal the window is closing.
- **Adjacent platform signal:** OpenAI launched ChatGPT Health (Jan 7, 2026) with b.well as connectivity infrastructure (2.2M providers, 320 plans). Consumer health-data aggregation is going mainstream-platform; a "check this bill" feature inside ChatGPT Health is a plausible 12–24 month absorption risk — and also validation that consumer-permissioned health data UX is ready.
- Flexpa itself launched **Flexpal**, a consumer AI app over claims data ("how much did that procedure cost?") — the infrastructure player is creeping toward the use case from the claims side.

---

## (d) Pricing Recommendation & PWYW Verdict

**Market norms (verified June 2026):** Goodbill 20% of savings capped at $1,000 · Resolve 25%/10% tiered, no cap · HealthLock $34.99/mo + 20% of recoveries · Sheer $40/mo or % of recovery · Claimable $39.95 flat · the entire denial-appeal lane is free (nonprofits/open-source). Contingency-on-savings is the category default and consumers accept it.

**PWYW evidence:**
- Gneezy et al., *Science* 2010 (n=113K, field experiment): pure PWYW → mean payment **$0.92**; adding 50%-to-charity → **$5.33** (6x) with halved participation; the charity+PWYW condition was the most profitable overall.
- 2024 PRISMA systematic review (106 studies): PWYW works in charitable/experiential, **low-cost-structure**, high-price-sensitivity contexts; long-term revenue durability is an explicit evidence gap; suggested-price anchors are the practical risk-mitigation lever (with mixed evidence on anchor strength).
- Real-world: Panera Cares dead by 2019; Humble Bundle abandoned pure PWYW; the one longitudinal study shows payments decay over time.

**Verdict for PWYW-after-successful-dispute:** Unusually favorable conditions — the ask lands at the moment of concrete, quantified value ("we just saved you $1,840"); a natural anchor exists (% of savings); the trust-deficit category makes the gesture differentiating; automated disputes have near-zero marginal cost. But the evidence says never run it blank-field:
1. **Anchor it:** "Suggested: 10% of what we saved you — pay what feels fair, including $0."
2. **Frame it prosocially:** e.g., a slice funds disputes for patients who can't pay (Mark Cuban's Coverage Fund at Claimable is precedent in-category).
3. **Backstop it:** PWYW for the automated self-serve tier (launch wedge, word-of-mouth engine); conventional capped contingency (15–20%, capped) for any high-touch negotiation tier; don't underwrite the business on PWYW durability — the literature explicitly can't support that yet.

---

## (e) Regulatory Tailwinds & Headwinds (verified June 2026)

| Area | Status | Direction |
|---|---|---|
| CFPB medical-debt credit-reporting rule | **Vacated** July 11, 2025 (E.D. Tex. consent judgment); Oct 2025 CFPB interpretive rule asserts FCRA preempts state bans | Headwind (but credit-report leverage was never core to this product) |
| 15 state credit-reporting bans | All nominally in effect; first preemption test case live (*ACA Int'l v. Fulford*, D. Colo., filed Nov 2025) | Fragile — don't build on it |
| Credit bureau voluntary practices (paid debts removed, <$500 never reported, 1-yr delay) | Still in effect, voluntary, reversible | Neutral |
| NSA patient-provider dispute resolution (self-pay, $400 over GFE, $25 fee) | Live, underused, directly automatable | **Tailwind** |
| Advanced EOB / insured-GFE rulemaking | Proposed rule targeted ~Mar 2026, slipping; would create the strongest insured-patient pre-dispute tool | Delayed tailwind — watch closely |
| NSA IDR (payer↔provider arbitration) | 4.8M cumulative disputes; providers win 88%; captured by institutional filers | Irrelevant to consumers |
| State charity-care screening / itemized-bill / billing-protection laws (CO, MN, NY, CA leading) | Growing; not FCRA-preempted | **Tailwind** — durable hooks for the product |
| Hospital price transparency | Enforcement accelerating (10 CMPs in 2025, 2x prior pace); Apr 1, 2026: CEO attestation + actual-claims-based data required | **Tailwind** — benchmark data improving, but 75% of MRFs still need heavy normalization engineering |
| Information-blocking enforcement | Live since Sep 2025; first ONC nonconformity letters Feb 2026; $1M/violation exposure for blockers | **Tailwind** — legal backing for patient data access |
| TEFCA Individual Access Services | Operational (Flexpa is an IAS provider; Epic supports IAS) | **Tailwind** — payer-agnostic clinical pipe |
| HTI-5 proposed rule (deregulatory) | Comment period closed Feb 2026; doesn't rescind patient-access mandates but signals softer enforcement | Mild headwind / uncertainty |

**Net: moderate tailwind**, concentrated in exactly the workflows that don't need payer APIs (PPDR, charity care, transparency benchmarks, clinical-record access).

---

## Data-Access Feasibility (the EOB half)

- **Mandated & live today (CMS-9115-F, since Jul 2021):** claims/EOB via FHIR `ExplanationOfBenefit` for MA, Medicaid managed care, CHIP, FFE QHPs. CMS-0057-F adds prior-auth data + USCDI v3 by **Jan 1, 2027** — same payer types, no structural expansion. No litigation blocking it found.
- **Flexpa (fastest path):** 433 payers in production, claimed 94% of CMS lives / 165M people, 93% retrieval success. Pricing: **$20K/yr Builder** (5K users) → $50K Growth (50K users) → $350K Omni. Also now a TEFCA IAS provider (clinical side) and shipping its own consumer app (Flexpal).
- **The gap:** ERISA self-funded employer plans (~63% of employer-covered workers, ~100M people) have **no API mandate, no DOL rule coming, no TPA voluntary adoption found**. Workarounds: manual EOB upload, Sheer-style credential connections, or waiting.
- **Epic patient-access tier:** clinical resources are rich (notes via DocumentReference, labs, meds, procedures — USCDI v3 floor since Jan 2026); its patient-facing `ExplanationOfBenefit` is a **prior-auth artifact, not a financial EOB**; no patient-facing billing resources (Account/ChargeItem) verified. Adjudicated dollars come from the payer side only.
- **Alternatives assessed:** Fasten (clinical-only), 1upHealth (payer-side compliance infra), Metriport (clinical, B2B), Particle (clinical HIE; Epic antitrust litigation ongoing — dependency risk), b.well (B2B infra; powers ChatGPT Health).

**Verdict:** EOB auto-reconciliation is technically live today for ~35–45% of insured Americans at ~$20K/yr entry cost. Not feasible at full consumer scale; design the product so this is an enhancement, not a prerequisite.

---

## Top Risks for a New Entrant

1. **The graveyard signal:** two funded, capable teams validated consumer demand and still chose B2B (Avelis explicitly, Goodbill by drift). Talk to them before building — if the answer is "CAC + collections friction," automation changes the math; if it's "hospitals stonewall consumer disputes," it doesn't.
2. **Self-funded employer gap** locks the most commercially attractive users out of the EOB feature; upload/credential fallbacks add friction exactly where the market is richest.
3. **Free-adjacent crowding:** nonprofits and open-source own the denial lane and charity-care mindshare; consumer willingness-to-pay is compressed category-wide.
4. **Platform absorption:** ChatGPT Health (b.well), Novellia, Flexpa's Flexpal — three well-funded players are one feature away. Speed and the clinical-verification moat matter.
5. **PWYW durability is unproven** — fine as wedge, dangerous as foundation.
6. **Engineering grind underestimated:** hospital MRF normalization (75% of files need expert interpretation), per-hospital portal quirks, and episodic-usage retention are the unglamorous hard parts.
7. **Regulatory timing:** AEOB rule slippage delays the strongest insured-patient lever; HTI-5 signals softer enforcement climate.

## Open Questions / Suggested Next Moves

1. **Founder conversations:** Avelis (why upstream — economics or structural?), Goodbill (what DTC taught them). This is the cheapest de-risking available.
2. **ICP decision:** ACA individual-market beachhead (full product works, motivated users) vs. universal upload-first MVP (bigger market, weaker data).
3. **MVP that dodges the payer-API constraint:** bill upload + itemized-bill request + benchmark check + clinical verification (Epic sandbox prototype is a weekend) + letter generation + charity-care screen. EOB auto-sync as v2 for covered segments.
4. **Watch list:** Novellia shipping anything billing-adjacent; AEOB proposed rule (~mid-2026); *ACA v. Fulford* ruling; ChatGPT Health feature expansion.

---

## Addendum 2026-06-12: Granted Health (closest competitor found — missed by the original scan under its old name) + Resolve refresh

**Granted Health** (grantedhealth.com, ex–Medbill AI, NYC, founded 2023): AI + human-advocate consumer app — bill audit, EOB monitoring via OAuth to 1,300+ insurance/patient portals, denial appeals, negotiation, charity care. **$17M raised June 2024** (Forerunner, RRE, Factorial+), 23 employees, claims 25K+ families, iOS-only (65 App Store ratings), unverified "70% average savings" claim. **Business model:** stated = contingency 10% of savings **capped at $200/bill** (trust-subsidy economics, not a revenue model); ToS quietly scaffolds an unannounced **subscription** model; privacy policy reserves de-identified data aggregation (unexercised option); zero B2B by deliberate positioning ("works for you, not your employer"). **Their gaps = our moats:** no clinical-record verification, no published methodology/evidence chain, no Android/web reach, pricing bait-and-switch risk vs. our free-to-know/PWYW posture. Their portal-OAuth approach validates the credential path through the self-funded-employer EOB gap (our V1). Their modest traction at 23 months post-raise re-confirms this brief's CAC warning.

**Resolve refresh:** pricing unchanged, but (a) **minimum-fee clauses** can take up to 50% of small savings (consumer-hostile floor — positioning angle); (b) FinFit employer channel **closed to new patients Sept 2024** (the B2B2C route didn't stick); (c) ToS **explicitly disclaims HIPAA coverage** — opposite of our PHI-grade posture; (d) still zero automation; ~$5M total raised; "$55M saved" is the claim to beat.

## Caveats

- Goodbill hospital counts, Avelis results, Novellia retrieval claims are vendor self-reported.
- "No payer API" / "no clinical verification" findings for competitors are inferences from absence in public materials.
- Pricing pages can change without notice — re-verify before launch decisions. Novellia raise was 9 days old at verification; HealthLock's Mastercard sunset just passed (Mar 31, 2026).
- Fight Health Insurance "Totient" commercial entity could not be verified.
- PWYW external validity to this category is untested; the two key findings carried 2-1 verification votes (anchoring guidance, HealthLock pricing structure).

## Key Sources

Goodbill: goodbill.com, help.goodbill.com (pricing) · Resolve: resolvemedicalbills.com FAQs · HealthLock: healthlock.com/plans + support center · Avelis: YC profile, avelishealth.com · Claimable: getclaimable.com, Bloomberg 2026-04-22, PYMNTS · Dollar For: dollarfor.org, KFF Health News · Counterforce: counterforcehealth.org, Axios Raleigh 2025-08-20, NC Health News 2025-11-22 · Fight Health Insurance: fighthealthinsurance.com · Sheer: sheerhealth.com · Novellia: PR Newswire 2026-06-02, novellia.com, MedCity News · Flexpa: flexpa.com/pricing, Nov 2025 Payer API Report · CMS: CMS-9115-F & CMS-0057-F pages/fact sheets, nosurprises PPDR guidance, CY2026 OPPS transparency fact sheet · Regulatory: Brownstein Hyatt (CFPB vacatur, Colorado suit), NCLC, McDermott+ 2026 NSA to-do list, Georgetown CHIR IDR data, Commonwealth Fund 2025–2026 state reports, Alston & Bird / Holland & Knight (info-blocking enforcement) · PWYW: Gneezy et al. Science 2010 (10.1126/science.1186744), 2024 PRISMA review (10.1016/j.iedeen.2024.100266)
