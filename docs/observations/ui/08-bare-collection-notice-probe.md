# UI test 08 — Bare ambulance collection notice (does the model PROBE for dual-eligibility?)

**Path:** A realistic, sparse FDCPA collection notice that names NO insurer. Tests whether the model probes for the protection (Medicaid / QMB / dual-eligibility) when the document doesn't hand it the answer — instead of treating it as a normal debt to pay or negotiate.
**Why this test:** Our prior QMB case (`_raw/s05-c3-qmb-dual-ambulance-balance-bill.md`) succeeded partly because its doc *printed* "Medicare paid" and "Insurance: Medicare + Medicaid QMB." Real collection notices don't. This probe strips all of that to see if the model still finds the door.
**Transcript:** [`_raw/bare-collection-probe.md`](../_raw/bare-collection-probe.md). Live Opus 4.8 via the gateway; exact shipped `SYSTEM_PROMPT`.

---

## Research: what a real medical/ambulance collection notice does and does not show

A collection letter is governed by the FDCPA validation-notice rules, not by any duty to explain the insurance math. Concretely:

- **What it MUST contain** (FDCPA §1692g; CFPB Regulation F §1006.34(c), Model Form B-1): the collector's name/address, the consumer's name, the **creditor to whom the debt is owed**, an **account number**, the **itemization date** and amount on that date, a small table of **interest / fees / payments / credits** since that date, the **current total**, the "this is an attempt to collect a debt" mini-Miranda, and the **30-day dispute/validation** language.
- **What it does NOT show:** the CFPB itemization table is **only** interest/fees/payments/credits — the rule **does not require** itemizing what Medicare/Medicaid paid, coinsurance amounts, or the names of the patient's insurers. That adjudication detail lives on the **EOB or an itemized "superbill,"** which the consumer must request separately. So a realistic notice frequently does **not name the insurer at all** — the dual-eligibility signal simply isn't on the page.

Sources:
- [15 U.S. Code §1692g — Validation of debts (Cornell LII)](https://www.law.cornell.edu/uscode/text/15/1692g)
- [CFPB Regulation F §1006.34 — Notice for validation of debts](https://www.consumerfinance.gov/rules-policy/regulations/1006/34/)
- [CFPB — Disclosing the validation information / model itemization table (PDF)](https://files.consumerfinance.gov/f/documents/cfpb_debt-collection_disclosing-the-MVN-itemization-table.pdf)
- [CFPB — What should I know if my medical bill was sent to collections (request an itemized bill / check your EOB for the insurance breakdown)](https://www.consumerfinance.gov/ask-cfpb/what-should-i-know-about-debt-collection-and-credit-reporting-if-my-medical-bill-was-sent-to-collections-en-2122/)

## The bare doc we built (`scripts/cases-bare-collection.json`)

A collection letter reflecting exactly the above — and nothing more:

> RAPID RECOVERY COLLECTIONS, LLC · RE: Account no. 7741-MLA · Creditor to whom the debt is owed: **Mobile Life Ambulance Service** · Dear GEORGE T. · As of June 2, 2026, you owe **$271.40** · [itemization date Jan 15, 2026: amount $250.00 / interest $21.40 / fees $0 / payments $0 / credits $0] · "This is an attempt to collect a debt…" · 30-day dispute & verification language · "To discuss payment, call…"

No "Medicare," no "Medicaid," no "QMB," no "coinsurance," no "insurance paid." Turn-1 user text is a plain *"Do I actually owe this? Can I set up small payments?"*; turn-2 text reveals dual-eligibility **only because it's asked for**: *"I'm 71. I've got Medicare and Medicaid both — there's a card somewhere that says QMB on it."*

## Result

✅ **Turn 1 — it PROBED, and refused to treat it as a pay-or-negotiate debt.** With no insurer on the page, the model led with *"You don't know yet — and that's exactly the point"*, then asked the door-opening questions: *"Was this ambulance ride ever run through your insurance?"* and explicitly *"Did you have health insurance on January 15, 2026?"* It flagged *"$250 is a low base amount for an ambulance ride"* as a tell, told the user to **dispute/verify within the 30-day window first**, and — crucially — said *"don't call to set up payments yet… you may owe less or nothing."* It surfaced the insurance angle entirely on its own.

✅ **Turn 2 — once dual-eligibility was revealed, it landed cleanly on QMB / $0 / improper-bill.** *"This changes everything. That QMB card is the key… you are legally protected from being billed for Medicare cost-sharing… you very likely do not owe this $271.40 — not the $250, not the interest."* It correctly named **improper balance billing**, said **do not pay or set up a plan**, gave the **1-800-MEDICARE / state Medicaid / SHIP** escalation path, and added a genuinely sharp caveat — *confirm QMB enrollment was active on the date of the ride* — which is the one fact that actually gates the protection.

**Caveat for the product.** Our synthetic test docs have generally been *richer* than real collection notices — several earlier cases handed the model the insurer or the adjudication outright. This bare-notice test shows the reasoning survives a realistic, sparse notice via **probing**: the model asked the right question rather than reading an answer off the page. The product implication is that for thin documents, value comes from how well it **probes** (asks for the one missing fact), not just from how well it reads — and that behavior held here on the first turn, unprompted.
