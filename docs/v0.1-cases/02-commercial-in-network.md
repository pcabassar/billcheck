# V0.1 cases — Segment 2: Commercial, in-network

> **Status: INPUT (V0.1).** 5 real, cited cases (one shared with Seg 3). Template v2.1. Index: [../v0.1-cases.md](../v0.1-cases.md). _2026-06-17._

### 2.1 — Prenatal labs coded *diagnostic* instead of *preventive* (ACA $0 violation) — *= case 3.3 (cross-ref; count once)*
- **Insurance:** Commercial fully-insured Anthem BCBS-TX, in-network hospital lab. **Engine-relevant? Yes** (preventive-vs-diagnostic CPT misclassification).
- **Money:** billed $9,520; allowed $6,700; paid $4,310; owed **$2,390**. Four prenatal screens (Rh, HepB, HepC, syphilis) are ACA $0-cost preventive but billed diagnostic.
- **What happened:** internal appeal **denied** ("billed as diagnostic per plan"). Unresolved.
- **Levers:** **ACA §2713 preventive-$0** argument per CPT; 2nd-level/external review (TX DOI); recode/rebill; benchmark.
- **Signal:** the **ACA preventive-$0 mandate** is a powerful, common lever when preventive services are miscoded diagnostic.
- **Source:** [KFF/NPR, Nov 2023](https://kffhealthnews.org/news/article/routine-bloodwork-lab-work-tests-surprise-bill/)

### 2.2 — Widow re-billed $1,093 a year after husband's death, on an EOB she'd already paid ("clerical error"; resolved via press)
- **Insurance:** Commercial fully-insured BCBS-IL; in-network (Barnes-Jewish). EOB settled & paid, then a **revised** bill 14 months later. **Engine-relevant? Yes** (re-adjudication / adjustment-line change).
- **Money:** charged $110,666; allowed $60,349; original patient owed **$823.15 (paid)**; then demanded **$1,093.16** more.
- **What happened:** she withheld payment; **only after KFF contacted the hospital** did BJC call it a "clerical error" and zero the balance. No self-serve path existed.
- **Levers:** demand reconciliation vs the **original EOB** + proof of payment; written dispute; **timely-filing** rules (re-billing limits); FDCPA if collections; **press**.
- **Signal:** providers **re-bill settled EOBs**; the only thing that worked was press → reinforces the productized-press/advocate lever + keeping the original EOB in the evidence log.
- **Source:** [KFF/NPR, Aug 2023](https://kffhealthnews.org/news/article/widow-hospital-collections-bill-adjustment-postmortem-bill-of-the-month-august-2023/)

### 2.3 — Colonoscopy billed as *two* via a modifier code: $19,206 charged, $4,047 owed; both appeals denied
- **Insurance:** Commercial Aetna (FI vs self-funded undocumented); in-network (Northwestern). Pre-service estimate $7,203 ($2,381 patient). **Engine-relevant? Yes** (modifier / NCCI; two $5,466 line items for one procedure).
- **Money:** charged **$19,206**; allowed $5,816; paid $1,979; owed **$4,047** (vs $2,381 estimate).
- **What happened:** hospital + Aetna appeals both **denied** ("paid accurately"); he left Northwestern. Unresolved/lost.
- **Levers:** **GFE → PPDR** (>$400 over estimate; 120-day window); **NCCI/modifier audit** (modifier 59/51 misuse); external review (IL); benchmark (>2× median).
- **Signal:** coding/modifier disputes are **engine-relevant** but **appeals routinely fail** — GFE/PPDR + a billing-code audit + regulator are the stronger plays.
- **Source:** [KFF/WaPo, Dec 2024](https://kffhealthnews.org/health-care-costs/surprise-bill-colonoscopy-chicago-northwestern-december-bill-of-the-month/)

### 2.4 — Preventive colonoscopy "surgical tray" add-on $250 each; **won** via appeal + DOI complaint + press (provider dropped it systemwide)
- **Insurance:** Commercial ACA-marketplace BCBS-IL; in-network GI group. Preventive colonoscopy = ACA $0. **Engine-relevant? Yes** (unbundled supply/"surgical tray" code added to a $0 preventive service).
- **Money:** ~$600 gross "surgical tray" → **$250 each** applied to deductible → **$0 after appeals**.
- **What happened:** couple filed **appeals + IL DOI complaint + wrote legislators + KFF**; BCBS approved both appeals and the **practice dropped the fee for all patients.** Full win.
- **Levers:** **ACA §2713** (incidental supplies bundled into $0 preventive); **NCCI bundling**; **state DOI complaint**; press.
- **Signal:** **preventive-$0 + unbundled-add-on** is a clean, winnable pattern; **appeal + regulator + press together** produced a *systemic* fix.
- **Source:** [KFF/NPR, Jan 2024](https://kffhealthnews.org/news/article/bill-of-the-month-free-colonoscopies-random-supplies-charge/) · [Sun-Times follow-up](https://chicago.suntimes.com/2024/2/2/24050749/medical-bills-colonoscopy-hinsdale-free-preventive-care-illinois-gastroenterology-group)

### 2.5 — Annual physical labs coded diagnostic + routed to a hospital lab → $1,223; appeal denied
- **Insurance:** Commercial ACA-marketplace BCBS-IL; in-network (UI Health) but labs sent to **hospital lab** (50% coinsurance vs $0 preventive). **Engine-relevant? Yes** (preventive-vs-diagnostic + site-of-service).
- **Money:** ~$1,430 total; labs **$1,223.22** at 50% coinsurance.
- **What happened:** appeal **denied** — insurer/provider said the visit included **medication monitoring** (not purely preventive). Unresolved/lost.
- **Levers:** **external review** citing USPSTF/HRSA $0 services; **mixed-visit rules** (charge only the non-preventive part; *Braidwood v. Becerra* context); recode + route labs to independent lab; DOI; hardship.
- **Signal:** **mixed preventive/diagnostic visits** are a murky, common trap; site-of-service routing inflates labs; preventive-$0 still applies to the qualifying tests within a mixed visit.
- **Source:** [KFF/WaPo, 2025](https://kffhealthnews.org/news/article/preventive-care-free-checkup-surprise-billing-bill-of-the-month/)

---
**Segment signals:** (1) **The ACA preventive-services $0 mandate is a top-tier, common, winnable lever** — preventive miscoded as diagnostic, unbundled "tray/supply" add-ons, mixed visits, hospital-lab routing. (2) **Internal appeals frequently FAIL** (3 of 5 lost); the actual resolvers were **press** and **regulator (DOI) complaints** — and appeal+regulator+press together produced a *systemic* fix. (3) Coding/modifier + post-payment re-billing are **engine-relevant** but often need GFE/PPDR or a code audit, not just an appeal. (4) **Site-of-service / hospital-lab routing** inflates "in-network" bills.
