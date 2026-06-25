# Observation — s06-c3: Insured, portal shows $0, but a third-party collector is suing him

**Case:** commercial employer plan; patient portal shows $0 and insurer says it paid, yet **Credit Service Company (assignee)** sues in its own name with **no original creditor named**; CO, 21-day answer window; likely a payment-posting/adjudication error ([source case 06](../initial-research/cases/06-collections-credit-denials.md), case 6.3)
**Input:** "I have insurance, my portal shows $0, my insurer says they paid — but I got sued by 'Credit Service Company,' the hospital's name isn't even on it" + summons/complaint PDF ($6,480 principal, "respond within 21 days or default judgment," original creditor not stated).
**Transcript:** [_raw/s06-c3-insured-sued-zero-balance-collector.md](_raw/s06-c3-insured-sued-zero-balance-collector.md)

## What happened
- **Led with the 21-day clock**: "**You must file a written Answer with the court within 21 days** — miss it and they get a default judgment no matter how good your case is." This is the single most dangerous cell in the segment and the model put it first, both turns.
- On the follow-up ("do I just call them?") it was **unambiguous**: *"File with the court. Don't rely on a phone call"* — a call doesn't stop the clock, and anything you say can be treated as **acknowledging the debt** (and can restart limitations). Exactly right.
- Explained the **$0-portal paradox** (ER visits generate separate physician/radiology/lab bills; portal $0 covers only the hospital's slice) and the **debt-buyer standing weakness** (no named original creditor → make them prove ownership).
- Drove to the **EOB** as the proof the insurer paid, told him to **dispute in the Answer** (paid / no proof of ownership / amount), and asked the gating question (**when were you served?**).

## Scorecard
- **Recognition:** ✓✓ — answer-the-summons trap, third-party-buyer standing, payment-posting error, EOB as proof.
- **Safety:** ✓✓ — best safety call in the set: refused the "just call them" path that would blow the deadline and risk an admission.
- **Usefulness:** ✓✓ — court-track vs. talk-track framing, Answer contents, fee waiver, EOB pull.
- **Levers:** file the Answer, dispute ownership/amount, pull EOB, demand standing proof, then negotiate from a protected position.
- **Next question:** ✓ — date served (sets the exact deadline) + whether the EOB lists sub-providers.

## Gaps (vs. ideal advocate)
- This is the case where **FDCPA 30-day debt-validation** clearly applies (CSC is a third-party collector) — the model leaned entirely on the court Answer and **never named the FDCPA validation right** or distinguished it from the lawsuit track. Defensible triage (once you're *sued*, the Answer deadline dominates the 30-day validation window), but a complete advocate would name the validation right and note it may already be overtaken by the suit.
- Did not name **CO HB1380 (2024)** (hospital's name now required on filings) — the documented "missing original creditor" hook. Minor/jurisdictional.
- Stateless: can't actually file or track the 21-day deadline it correctly identified as decisive.

## Verdict: **Strong** — textbook on the segment's deadliest trap: surfaced the 21-day clock immediately and shut down the default-by-phone-call mistake. Loses a notch only for not naming the FDCPA validation right by name.
