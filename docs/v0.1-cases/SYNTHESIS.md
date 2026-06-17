# V0.1 cases — cross-case synthesis

> **Status: LEADING (V0.1).** The analytical payoff of the case corpus — patterns across
> **insurance situation × lever × outcome**, and what they imply for the build. Not gospel.
> Corpus: **31 documented cases** = 3 deep seed cases ([../v0.1-cases.md](../v0.1-cases.md))
> + 28 across 6 insurance-situation segments (files [01](01-uninsured-self-pay.md)
> · [02](02-commercial-in-network.md) · [03](03-out-of-network-surprise.md) ·
> [04](04-medicare.md) · [05](05-medicaid-dual-cob.md) · [06](06-collections-credit-denials.md)).
> Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17._

## 1. Headline findings (the few things that should drive the build)

> **⚠ Read this first — selection bias.** This corpus is drawn from *journalism* (KFF Bill of the
> Month, ProPublica, STAT) and enforcement actions. That frame over-samples **egregious bills that
> were newsworthy and often resolved *via* the press coverage itself** — so any "press is the most
> decisive lever" reading below is an **artifact of where the cases came from, not a population
> statistic.** Nobody writes a story about a correct bill. In the real distribution, the
> **highest-frequency, highest-value jobs are mundane triage**, and Pedro's hypothesis for the true
> top two is almost certainly right:
> 1. **"Don't pay that yet — it's a *statement*, not the final bill."** (wait for the itemized bill / EOB)
> 2. **"This looks correct, here's why — you're fine to pay it."** (reassurance + permission)
>
> The dispute machinery below is the *long tail* — high-stakes, high-differentiation, but rare. The
> build should optimize for the common path first and treat the arsenal as depth behind it.

1. **The engine is a minority tool — confirmed at scale.** It is the *central* lever in only
   ~8 of 31 cases, all clustered in **commercial-in-network coding** (preventive-vs-diagnostic,
   modifier/unbundling, re-adjudication) and **uninsured benchmarking** (GFE-vs-actual,
   cash/prompt-pay). Everywhere else the work is *recognize the situation → assert a right →
   draft the artifact → escalate → track the clock*. Even in engine cases, the engine rarely
   *resolved* it — a non-engine lever (PPDR, external review, regulator, press) did. **Build an
   advisor with tools; the engine is one tool with a known home turf, not the spine.**

2. **Insurance situation is the master key — it decides which levers are even legal.** The same
   $5,000 bill routes to completely different playbooks depending on coverage. This is the
   agent's first fork, and the #1 thing intake must nail (see §2). Two sub-facets are
   load-bearing across segments: **fully-insured vs self-funded (ERISA)** — decides state-law
   leverage and your venue (state DOI vs DOL/ERISA appeal) — and **dual/QMB status** — flips a
   bill to a near-automatic $0.

3. **Press/public pressure broke the logjam in many of these *journalism-sourced* cases** (Dula,
   Barrett, Birch, Reynolds, Wirt, Tuszynski, Panozzo-systemic, the air ambulance, the late-filing
   collections) — **but see the selection-bias caveat above: this is the long tail, not the common
   case, and its prevalence here is partly circular** (these cases are in the dataset *because* a
   reporter took them). Treat press as a real, differentiated capability for egregious + documented
   + sympathetic cases, with the most guardrails — not as the default play. It can arrive too late,
   and a win may not make the user whole.

4. **Internal appeals frequently FAIL; escalation wins.** Internal appeals lost outright in a
   large share of denial cases; **external independent review, regulator complaints, and press are
   what actually flipped them.** The agent's instinct must be to *drive past* the internal appeal
   to external review (+ expedited/peer-to-peer tracks for anything urgent), not stop at it.

5. **The product is a persistent advocate / campaign-runner, not a one-shot auditor.** Cases run
   weeks-to-years, multi-channel, with hard deadlines. "Won on paper ≠ made whole" recurs to the
   point of tragedy in the Medicare cases (patients died mid-appeal, savings spent down). **Speed
   and the deadline clocks are the product's job**, and the **activity log is the asset** (the
   evidence chain a chargeback/regulator/court/journalist needs).

6. **Most patients don't know their rights and simply pay.** Across QMB, Medicaid balance-billing,
   timely-filing, ACA preventive-$0, GFE/PPDR — the dominant failure mode is *non-assertion*. The
   core value the product adds is **recognition + assertion of an existing right**, well before any math.

## 2. The situation → lever map (the agent's routing logic)

The first fork is **insurance situation**; it gates the lever set. Condensed from all 31 cases:

| Insurance situation | First-line levers (situation-specific) | Engine relevance |
|---|---|---|
| **Uninsured / self-pay** | Charity care / 501(r) (+ each physician group's own policy); **GFE → PPDR** (>$400, 120 days); cash/prompt-pay + competitor/Medicare benchmark; IRS Form 13909 for 501(r) violations; hardship/bankruptcy | **Medium** (benchmark, GFE-vs-actual, itemized review) |
| **Commercial, in-network** | **ACA §2713 preventive-$0**; coding/modifier/NCCI audit; internal appeal → **external review**; state DOI; GFE/PPDR; site-of-service/facility-fee challenge | **High** (the engine's home turf) |
| **Commercial, OON / surprise** | **NSA** (know the loopholes: emergency-by-route, medical-necessity denials, post-visit consent, IDR-too-costly-for-small-bills); **state surprise law (fully-insured only)**; employer broker/HR; external medical review + provider attestation | **Low** |
| **Medicare FFS (+Medigap)** | Timely-filing / assignment defense (provider can't bill); **observation-status appeal** (Alexander v. Azar); MSN-based redetermination → QIC → ALJ → MAC → court (120-day first clock); Medigap follows Medicare | **Low** (rule-citation only) |
| **Medicare Advantage** | Org determination → **IREO (Maximus)** → ALJ → MAC → court (60-day clocks); **expedited/QIO/NOMNC tracks (72h / 1-business-day)**; **physician medical-necessity letter (decisive exhibit)**; challenge algorithmic UM (CMS 2023/24 guidance); directory-accuracy + network-adequacy | **Low** |
| **Medicaid / dual-eligible (QMB)** | **Balance-billing prohibition = $0 defense**; out-of-state emergency coverage; **retroactive eligibility (file fast — window shrinking under H.R. 1)**; CMS/CFPB/AG complaints; credit-bureau disputes | **None** |
| **Coordination of benefits** | Fix primary/secondary order (birthday rule); **ERISA appeal (self-funded) vs state DOI (fully-insured)**; employer HR/broker; "insurance dispute" billing hold | **None** |
| **Any of the above → collections/legal** | **Answer the summons — never default**; FDCPA validation (3rd-party collector); pull the EOB to prove payment; negotiate lump-sum payoff (20–50%); vacate default for improper service; bankruptcy as a floor | Sometimes (posting errors) |

## 3. The lever arsenal, ranked by what actually worked

Cross-cutting levers, ordered by observed decisiveness in this corpus:
1. **Press / public pressure** — most frequently decisive; productize (renamed "wall" + journalist outreach) with guardrails (truthful, user's own story, provider right-of-reply, opt-in). Caveat: can come too late.
2. **External independent review** (denials) — wins where internal appeals fail; + expedited (72h) and peer-to-peer for urgent.
3. **Regulator complaints** — state DOI, CMS/1-800-Medicare, CFPB, state AG; strongest *combined with* appeal + press (produced systemic fixes, e.g. Panozzo).
4. **Asserting a flat legal $0** — QMB/dual, Medicaid balance-billing, timely-filing, out-of-state emergency: near-automatic once the right is known.
5. **GFE → PPDR** (uninsured) — real and badly underused.
6. **Charity care / 501(r)** — high value, trap-laden (income-month technicalities, the physician-group loophole, eligible-but-sued).
7. **FDCPA / answer-the-summons / negotiate payoff** (collections) — never default; lump-sum payoffs land at 20–50%.
8. **Benchmark-vs-market · negotiate · payment plan · hardship/bankruptcy** — the always-available floor, so the honest answer is *never* "nothing": it's a **ranked options menu + real odds**.

## 4. Outcome patterns (the uncomfortable truths the design must respect)

- **Internal appeals are a speed bump, not the finish line** → default to planning the escalation past them.
- **"Won on paper ≠ made whole"** → push **speed**, **retroactive reimbursement**, and coverage-transition planning; a technical win after the deadline (or after death) is the failure mode to design against.
- **Multi-biller / multi-payer episodes recur** (501(r) physician-group loophole, NICU specialists, COB clawbacks) → **validates case → bill(s) → documents + the amounts model**; one episode legitimately carries many bills with different statuses, policies, and payers.
- **The legal landscape shifts** (CO HB1380, WV prior-auth reform, H.R. 1 retroactive-Medicaid cuts, Braidwood, Alexander v. Azar) → **versioned, citation-backed knowledge with dates** is a hard requirement, not a nice-to-have.
- **Coverage-type precision is a product requirement** — Medicaid FFS vs Medicaid MCO vs dual/QMB vs MA vs ACA-marketplace carry different rules; mislabeling sends the wrong lever (see 5.5).

## 5. What this implies for V0.1

- **Data model — confirmed.** Case (episode) → Bill (one biller, carries lifecycle/status) → Documents (typed evidence), with **amounts** (billed/allowed/paid/owed/in-collections/disputed) and the **activity log** as first-class. Multi-biller and multi-EOB are normal, not edge cases. Insurance situation is first-class: account-level coverage profile + per-bill snapshot, with **fully-insured-vs-self-funded** and **dual/QMB** captured explicitly.
- **Intake must nail insurance situation first** (then provider type, then problem family). It's the routing key for everything in §2. Where unknown, "do you even know your coverage?" is itself a triage branch.
- **Tools (in rough priority):** (1) **document upload + parse** — the universal floor that works for anyone regardless of integrations (per the Granted brief); (2) **artifact drafting** — appeal / external-review / PPDR / FDCPA / dispute / regulator-complaint / chargeback letters (the single highest-leverage capability, used in nearly every case); (3) **deadline + cadence scheduler** — because speed and clocks decide outcomes; (4) the **engine** — coding/duplicate/unbundling/benchmark, on its commercial-in-network + uninsured home turf; (5) **provider/price research**; (6) **press/outreach**; (7) integrations (insurer portal, FHIR) only as *accelerants*, never dependencies.
- **Knowledge base is core, not peripheral.** A versioned, cited rules library: NSA + loopholes, ACA §2713, 501(r)/charity, GFE/PPDR, FDCPA, QMB/Medicaid balance-billing + out-of-state emergency, Medicare FFS & MA appeal ladders + every clock, state surprise laws, ERISA distinction, retroactive-Medicaid timing. The agent's quality is bounded by this KB's accuracy and freshness.
- **The campaign engine is the differentiator.** A durable, multi-week, multi-channel advocate with deadlines + auto-cadence + a verbatim paper trail — the Two Chairs shape, validated by the Medicare/collections cases where timing was everything.
- **Triage is the center of gravity — not dispute.** Correcting for selection bias, the
  highest-frequency value is the mundane call: **"this is a *statement*, don't pay yet"** and
  **"this looks correct, you're fine to pay."** The dangerous error here is a false "pay it," so
  triage accuracy (esp. document-type detection: statement vs itemized bill vs EOB) is the first
  thing to get right and to eval. The dispute arsenal is depth *behind* this common path.
- **Scope signal for V0.1 (input to Q6, not a decision):** build the **common triage path first**
  (any-shape input → coverage situation + document-type → one of the few common verdicts incl.
  "don't pay yet" / "looks fine"), with **document parse** as the floor and **recognition +
  assertion + artifact-drafting across the situation→lever map** as the next layer, and the
  **engine on its narrow home turf**. Press and full durable-campaign automation are differentiators
  that can be staged. (Decide the actual cut when we resume the agenda.)

## 6. Open questions surfaced by the corpus
- One consolidated GFE or separate per provider? (1.2) — affects PPDR mechanics.
- Telehealth platform = hospital outpatient dept or not? (3.5) — decides whether NSA applies.
- How do we keep the KB fresh as the law shifts (H.R. 1, state reforms)? — versioning + review cadence.
- Press guardrails: exact opt-in, right-of-reply, and truth-substantiation flow before anything goes public.
- How early can the agent *reliably* detect "this needs external review / regulator / press, skip the internal-appeal dead-end"?
