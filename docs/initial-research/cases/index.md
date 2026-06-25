# billcheck — real case files

> Real, documented cases driving case-based design. _Updated 2026-06-17._
>
> **Corpus: 31 documented cases** = the 3 deep seed cases below + 28 across 6
> insurance-situation segments. **➜ Read the [cross-case SYNTHESIS](SYNTHESIS.md)** for
> the patterns (insurance situation × lever × outcome) and what they imply for the build.
>
> **+ Case 04** (below) — a first-party case run **live against the built prototype** (added 2026-06-24).
> It adds two patterns the original 31 underweight: **billing-timing anxiety** (a "past due" notice
> arriving before the EOB even posts) and **small-dollar calibration** ("$67.30 may not be worth a fight").
>
> **Template v2 (locked):** 1) situation + who · 2) what they'd
> already tried · 3) document/event timeline · 4) the money (amounts) · 5) their goal
> (what "winning" means) · 6) what actually happened (faithful) · 7) ideal play / levers ·
> 8) maps-to-model (data shape · lifecycle path · what the agent needs) · 9) clocks · 10) source.
> *(Cases 01–02 below are in the v1 template; v2 from Case 03 on. Segment files use the
> condensed v2.1 template, which adds an explicit "Insurance situation" field.)*

## Segment files (28 cases, by insurance situation)
- [01 — Uninsured / self-pay](01-uninsured-self-pay.md) (5)
- [02 — Commercial, in-network](02-commercial-in-network.md) (5; 2.1 = 3.3)
- [03 — Commercial, out-of-network / surprise](03-out-of-network-surprise.md) (5; 3.3 = 2.1)
- [04 — Medicare (FFS + Medigap, and Advantage)](04-medicare.md) (5)
- [05 — Medicaid, dual-eligible (QMB) & coordination-of-benefits](05-medicaid-dual-cob.md) (5)
- [06 — Collections, credit & legal + claim denials → appeals](06-collections-credit-denials.md) (5; 6.2 = 1.4)

The 3 deeply-documented seed cases (plus first-party Case 04, added 2026-06-24) follow.

---

## Case 01 — "One surgery, billed as two" (duplicate / unbundled facility fee · insured · in-network)

1. **Situation + who.** Jamie Holmes (NW Washington), **insured**, had a **pre-authorized tubal ligation** (2019) at an **in-network** facility — Pacific Rim Outpatient Surgery Center, Bellingham WA. Mid-operation the surgeon also cauterized early endometriosis tissue as a precaution — **one operative session.** The surgery center billed it as **two separate operations.**
2. **Document timeline.** Itemized facility bill with **two line items** ($4,810 each) → insurer adjudication/EOB → patient **balance bill** → debt **sold to a collection agency** → **lawsuit**.
3. **The money.** Billed **$9,620** (2 × $4,810). Insurer paid **$1,262**; after contractual adjustment patient billed **$2,605**; collections **lawsuit $3,792.19**. Disputed core: **one of the two $4,810 facility fees.**
4. **Her question/goal.** "I had **one** surgery — why am I billed for two?" → after being sued: "How do I not pay for an operation that didn't happen, without wrecking my credit?"
5. **What happened / the right help.** She **refused to pay** and **defended the suit**; **unresolved/ongoing** at the Aug-2024 story. *Right help:* pull the **itemized bill + operative note**, show one operative session ⇒ the second facility fee is a **duplicate/unbundled charge**; dispute pre-collections; then **FDCPA validation**; defend the suit.
6. **Maps-to-our-model.** One **case** → one **bill** (surgery-center charge) → **documents:** itemized bill (2 lines), EOB, collection notice, lawsuit summons. *Lifecycle:* should have run New → Gathering → Reviewed → Acting; **reality skipped to collections/lawsuit.** *Agent needs:* itemized bill + operative note; a duplicate/unbundling check; FDCPA + defend-a-suit + SOL knowledge; dispute + court-response artifacts. *Clocks:* FDCPA 30-day, answer deadline, SOL.
7. **Source.** KFF/NPR "Bill of the Month," Aug 2024 — [KFF](https://kffhealthnews.org/news/article/bill-of-the-month-one-surgery-charged-for-two-collections-lawsuit/) · [NPR](https://www.npr.org/sections/shots-health-news/2024/08/19/nx-s1-5072975/she-was-on-the-surgical-table-just-once-but-was-billed-for-two-operations) · [Seattle Times](https://www.seattletimes.com/seattle-news/health/wa-woman-had-1-surgery-but-was-billed-for-2-she-refused-to-pay/).

---

## Case 02 — "Out-of-network ground ambulance after a crash" (No Surprises Act gap · insured · advice/lever)

1. **Situation + who.** Peggy Dula (St. Charles, IL), **insured**, least-injured of 3 siblings in a crash (Sept 2021); three different fire-district ambulances; hers was **out-of-network**.
2. **Document timeline.** Ambulance invoice → insurer paid "**reasonable and customary**," leaving a **balance bill** → ~a year disputing → **collections** (Wakefield & Associates).
3. **The money.** Charge **$3,606** ($30/mile vs. siblings' $10/mile; >2× siblings for the same services). Patient owed **~$2,711** after R&C.
4. **Her question/goal.** "Why is my bill **3× my siblings'** for the same ride — and why am I stuck with it when I had no choice?"
5. **What happened / the right help.** **No clean lever existed** — NSA **excludes ground ambulance**, so the balance bill was legal. She fought ~a year; it went to collections; **resolved only after CBS/NPR/KHN coverage** zeroed the balance (Sept 2022). *Realistic help:* explain the gap, **negotiate**, check **IL ambulance law**, **appeal R&C**, **FDCPA** in collections.
6. **Maps-to-our-model.** One **case** → one **bill** (ambulance charge) → invoice, EOB, collection notice. *Agent needs:* knowledge of the NSA ground-ambulance exclusion, state ambulance laws, R&C appeals, negotiation, FDCPA; tools = KB lookup + negotiation/appeal artifact. *Hard truth:* resolution came via **press** — a lever we should productize (see below), not dismiss.
7. **Source.** KFF/NPR/CBS "Bill of the Month," Jul + Sept 2022 — [KFF (collections)](https://kffhealthnews.org/news/article/ambulance-balance-bill-surprise-car-crash/) · [KFF ($2,700 pulled back)](https://kffhealthnews.org/health-care-costs/ambulance-bill-collections-surprise-wreck/) · [Chicago Sun-Times](https://chicago.suntimes.com/2022/9/29/23376944/medical-bills-peggy-dula-st-charles-cbs-mornings-npr-pingree-grove-countryside-fire-protection).

---

## Case 03 — "Sold as onboarding, billed as a clinical session" (misrepresentation + non-delivery · insured · teletherapy · dispute-advocacy) — *v2 template*

1. **Situation + who.** Pedro C., **insured** (in-network), teletherapy provider **Two Chairs** (SF). A 45-min **"matching/onboarding" call** (May 12 2026), sold as a step to pair him with a therapist, was **billed to insurance as a clinical consult session**, hitting his **deductible for $179.** No usable match ever delivered (3 weeks, 5+ staff, the consult clinician quit). Canceled June 1. No coding/units issue — it's misrepresentation + non-delivery + consumer-protection levers.
2. **What they'd already tried.** Disputed on the email thread (firm sends 6/2, 6/10, 6/17). Got: (a) "it's your deductible," (b) "**legally unable to refund** / compliance," (c) deflection to "Quality Review." Chargeback + BBB + CA DFPI + insurer billing-accuracy flag drafted and staged.
3. **Document/event timeline.** Matching call (5/12) → "congrats" email (5/14) → match breaks down (5/21–26) → **$179 charge surfaces** (5/27) → consult clinician quit + fee-waiver floated (5/28) → cancel + refund demand (6/1) → "deductible" explanation (6/2) → **formal "legally unable" denial (6/3)** → escalation demanding a named owner (6/10) → deflection (6/11) → hard deadline set for 6/19 (6/17). **Open.**
4. **The money.** Charged **$179** (to deductible, out-of-pocket). Two Chairs' own OON list price for the matching appt = **$125** — so it's *also* overpriced, but that point was **deliberately withheld** from outbound to avoid the cheap-settlement trap. Disputed: full **$179** (not a reduction).
5. **Their goal.** **Full $179 refund** + written confirmation of no other charges. "Winning" = **no charge at all**, not a discount.
6. **What actually happened.** Unresolved/open. Provider rotated **5+ reps**, none able to decide; leaned on a **false "legally unable to refund / compliance"** claim. Being pursued via a **staged escalation ladder** (firm demand → chargeback → BBB → CA DFPI → insurer flag) with deadlines + automated cadence.
7. **Ideal play / levers** (a lever clinic): **goal-aware framing** (misrepresentation + non-delivery, *not* "wrong price"); **rebut "compliance/legally-unable"** (compliance governs billing, not the ability to refund); **demand a named decision-maker** (turns rep-rotation into evidence); **escalation ladder with teeth** (chargeback, BBB, CA DFPI, insurer billing-accuracy); **reject partials**; **deadlines + auto follow-up**; **press/public is live here** (a Yelp reviewer reports the *same $179 non-delivery pattern* — fits a public "wall" + a note to a consumer reporter); **full verbatim paper trail** throughout.
8. **Maps-to-our-model.** *Data shape:* one **case** → one **bill** ($179 charge) → **documents:** the charge/EOB, the **verbatim email thread**, the provider's policy + marketing language, public reviews, the staged complaint drafts. *Lifecycle:* New → Gathering → Reviewed (misrep + non-delivery diagnosis) → **Acting = a multi-week, multi-channel campaign (escalation ladder with sub-steps, deadlines, auto-cadence)** → Resolve/Reopen. *What the agent needs:* consumer-protection knowledge (chargeback rules, BBB, CA DFPI, FDCPA, the "compliance ≠ can't-refund" rebuttal); tools = **artifact drafting** (escalation emails, chargeback brief, regulator complaints), a **deadline/cadence scheduler**, **provider research** (pricing, terms, reviews), **paper-trail capture**. *Punchline:* the clearest **"persistent advocate / campaign-runner"** case — the agent runs a weeks-long campaign, not a one-shot audit.
9. **Clocks.** Provider deadline 6/19; chargeback filing window (~60–120 days); BBB/regulator response timers; insurer appeal window.
10. **Source.** Pedro's first-party documented case — "Two Chairs Refund Case Study," 6/17/2026 (verbatim Gmail thread + decision log). Open as of writing.

---

## Case 04 — "Routine PCP labs billed to my deductible — and a past-due notice before the EOB even posted" (preventive-vs-diagnostic miscoding + billing-timing anxiety · insured · first-party · live-prototype-validated) — *v2 template*

1. **Situation + who.** Pedro C., **insured (Aetna, in-network)**. Saw his PCP (Mt. Sinai Primary Care) for a routine visit; on-site bloodwork drawn (CBC, metabolic panel, A1c, vitamin D, thyroid). **Labcorp** billed it; a small patient balance landed on his deductible, and a **"past due" notice arrived while the Aetna EOB still read "available soon."**
2. **What they'd already tried.** Tried to view the EOB in the Aetna portal — not yet posted. Noticed the **past-due-vs-no-EOB timing mismatch** and worried it signaled something wrong.
3. **Document/event timeline.** Routine PCP visit + on-site labs → Labcorp claim adjudicated by Aetna (network discount + small payment) → **Labcorp invoice + past-due notice** → Aetna member EOB still "available soon."
4. **The money.** Labcorp billed **$1,331.40**; network/insurance discount **−$1,180.25**; **Aetna paid $83.85**; **patient balance $67.30** (deductible/coinsurance).
5. **Their goal.** Understand whether the $67.30 is real and owed, whether any of it should have been **$0 preventive**, and whether the past-due-before-EOB timing is a problem.
6. **What actually happened (live prototype, did well).** Over three turns the deployed prototype: read the Labcorp figures correctly; flagged the **preventive-care / ACA $0** angle (routine annual labs are often $0; miscoding to the deductible is common) and asked the gating question (annual physical vs. problem visit); on the timing worry, **correctly reassured** that Labcorp's and Aetna's clocks differ — a "past due" stamp with an unposted EOB is normal, not fraud, and a $67.30 past-due won't hit credit overnight; advised **don't pay yet**, call Aetna to confirm finalization + why $67.30, and call Labcorp (1-800-845-6167) to pause collection pressure while awaiting the EOB; and **honestly calibrated** that $67.30 may not be worth a long fight, while one non-routine lab landing on the deductible plausibly explains the amount.
7. **Ideal play / levers.** Pull/confirm the EOB; **preventive-vs-diagnostic reprocessing** (ACA $0 for the wellness labs; only the problem-driven lab on the deductible); **billing-timing literacy** (past-due ≠ EOB-posted; the two payers don't sync) — *reassurance, not a lever*; call-Aetna + call-Labcorp scripts to pause pressure; **small-dollar calibration** (name the honest cost/benefit instead of forcing a fight).
8. **Maps-to-our-model.** One **case** → one **bill** (Labcorp lab charge) → **documents:** the Labcorp bill, the (pending) Aetna EOB. *What the agent needs:* preventive-care/ACA coding knowledge, payer-timing literacy, reprocessing scripts, and the calibration to say "this may not be worth it." *New patterns this case adds:* **billing-timing anxiety** and **small-dollar honesty** — both about managing worry and proportionality, not just finding an error.
9. **Clocks.** Labcorp past-due/collection cycle; Aetna EOB posting lag (days–weeks); preventive reprocessing/appeal window once the claim finalizes.
10. **Source.** Pedro's first-party case, run live against the deployed billcheck prototype — verbatim transcript at [seed-04-pcp-labs-transcript.md](seed-04-pcp-labs-transcript.md). 2026-06-24.

---

## Cross-case signals
> These were the first signals from the 3 seed cases; the **full synthesis across all 31 cases**
> (which confirms and extends every point below) now lives in
> **[SYNTHESIS.md](SYNTHESIS.md)** — read that for the build implications.

1. **Most cases are advice and advocacy, not arithmetic.** Only ~8 of 31 cases hinge on a deterministic numeric check (duplicate, unbundling, reconciliation); the rest are recognition, knowledge, and drafting. It's an advisor with many tools — don't over-center any one of them.
2. **The product is a persistent advocate, not a one-shot auditor.** Two Chairs runs for weeks across channels with deadlines + automated follow-up — a durable-agent/campaign shape. Biggest architectural signal so far.
3. **Levers are an arsenal — and exist for almost any bill, even "valid" ones:** benchmark-vs-market (à la Granted) · negotiate · payment plan · charity care/FAP · dispute/appeal · FDCPA · **press/public** · hardship/bankruptcy. Honest value = a *ranked options menu + the real odds*, never "nothing."
4. **Press/public pressure is a real, productized lever** (Dula won that way; Two Chairs has the same-pattern public trail) — a renamed public "wall" + active outreach to local journalists/consumer reporters when a case is egregious + documented + sympathetic. Differentiator; needs legal guardrails (truthful, the user's own story, provider right-of-reply, opt-in).
5. **The activity log is the asset.** Verbatim communications + the user's narrative + decisions + deadlines = the evidence chain a chargeback / regulator / court needs. Capture everything, timestamped.
6. **Evidence lives beyond the bill** — the user's account, the email thread, the provider's own terms/marketing, public reviews. The agent gathers and weaponizes context, not just parses a PDF.
7. **Scope is wider than coding audits:** coding errors (Holmes) → surprise/affordability (Dula) → service misrepresentation/non-delivery disputes (Two Chairs). Through-line: "help me with this bill," not "find a coding error."
