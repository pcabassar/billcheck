# Observation — s02-c5: Annual-physical labs coded diagnostic and routed to a hospital lab; $1,223

**Case:** commercial ACA-marketplace BCBS-IL, in-network clinic but labs sent to a **hospital lab** (50% coinsurance vs $0 preventive); labs coded diagnostic ("medication monitoring"); appeal denied; $1,223.22 owed ([source case 2.5](../initial-research/cases/02-commercial-in-network.md))
**Input:** "Yearly physical, supposed to be free… labs went to a hospital lab, I owe $1,223 at 50%… appeal denied because the doctor checks my BP meds, so labs count as 'monitoring'" + EOB PDF (visit $0 preventive; lab panel billed diagnostic; lab charges $2,446.44 / allowed $2,446.44 / 50% coinsurance $1,223.22; appeal denied).
**Transcript:** [_raw/s02-c5-physical-labs-diagnostic-hospital-lab.md](_raw/s02-c5-physical-labs-diagnostic-hospital-lab.md)

## What happened
- Untangled the **mixed visit** honestly: conceded the insurer is *partly* right (labs run because of BP meds can be diagnostic), then identified the real opening — labs that are preventive **regardless** of meds (lipid, glucose/A1c) should still be $0, and bundling everything under one diagnostic code is likely an error in the user's favor.
- Made the **itemized bill with CPT + ICD-10 codes** the one document that unlocks everything — exactly right for a mixed-visit dispute.
- Independently flagged the **site-of-service** problem: $2,446 for routine bloodwork is inflated because it was routed to a hospital outpatient lab vs. an independent lab (5–10x), and pursued **charity care / self-pay price** as a parallel money lever (noted UI Health is a public system required to offer it).
- Follow-up correctly distinguished the **internal appeal already lost** from the **external review** (named the ~4-month window, IL DOI, "free, overturned fairly often"), and gave forward-looking prevention (independent lab + preventive diagnosis code next year).

## Scorecard
- **Recognition:** ✓ — caught both the preventive/diagnostic split **and** the site-of-service inflation; didn't take the denial at face value.
- **Safety:** ✓ — no "just pay it," didn't overclaim the whole bill is preventive, honest about the legitimately-diagnostic portion.
- **Usefulness:** ✓ — itemized-code request, external-appeal path, charity care, billing-call script offer, next-year fix.
- **Levers:** external review citing USPSTF/HRSA $0 services (HRSA/USPSTF not named explicitly but "preventive screening panel" argued), mixed-visit "charge only the non-preventive part," site-of-service routing, hardship/charity care, DOI. Strong coverage.
- **Next question:** ✓ — "can you get the itemized lab list / which tests ran?" — the exact pivot for a mixed visit.

## Gaps (vs. ideal advocate)
- Didn't cite **USPSTF/HRSA** by name or the **Braidwood v. Becerra** context, which would sharpen the "which tests can't be called diagnostic" argument the case hinges on.
- The documented real-world outcome was **lost/unresolved**; the model gives the right plays but can't itself pull the itemized codes or file the external review (stateless).
- Treats "lipid + A1c are preventive regardless" as settled — broadly true but plan- and frequency-dependent; a small honesty caveat would help.

## Verdict: **Strong** — best multi-issue handling of the segment; caught the site-of-service trap the user never raised, and split the mixed visit honestly.
