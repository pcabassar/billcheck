# v1 probe — s02-c1-prenatal-labs-diagnostic: Prenatal screens coded diagnostic instead of preventive (ACA $0)

_Persona: Pregnant, commercial Anthem BCBS-TX, in-network hospital lab. Routine prenatal blood screens she thought were free under her plan came back as a $2,390 bill. Already filed one appeal, got denied. Confused and frustrated; not a billing person._

### User (+ lab-eob.pdf)
I'm pregnant and went in for routine prenatal blood work at my hospital — the standard stuff they make everyone do early on. I was told preventive pregnancy care was supposed to be free. Now I owe $2,390 and when I appealed, they denied it and said the labs were billed as 'diagnostic.' I don't even know what that means. Did I do something wrong? Why am I being charged for screenings everyone gets?

> attached: ANTHEM BLUE CROSS BLUE SHIELD OF TEXAS · EXPLANATION OF BENEFITS - THIS IS NOT A BILL · Member: Maria T.    Group: Fully Insured PPO · Provider: Riverside Hospital Laboratory (IN-NETWORK) · Date of service: 02/03/2026   Claim #: TX5582019 ·  · Service line detail: ·   Rh factor / antibody screen   billed type: DIAGNOSTIC ·   Hepatitis B surface antigen   billed type: DIAGNOSTIC ·   Hepatitis C antibody          billed type: DIAGNOSTIC ·   Syphilis (RPR) screen         billed type: DIAGNOSTIC ·  · Amount billed ............................ $9,520.00 · Plan allowed amount ...................... $6,700.00 · Plan paid ................................ $4,310.00 · Applied to deductible / coinsurance ...... $2,390.00 · MEMBER RESPONSIBILITY .................... $2,390.00 ·  · Appeal status: INTERNAL APPEAL DENIED - billed as diagnostic per plan

### billcheck
First — no, you didn't do anything wrong. This is a coding problem, not a you problem. Let me explain what happened and why you have a strong case.

**What "diagnostic" vs. "preventive" means**

When a lab is coded as *preventive* (screening), the ACA requires most plans to cover it at 100% — no deductible, no coinsurance. When it's coded as *diagnostic*, the plan treats it like any other care and applies your deductible and coinsurance. That single label is the entire reason you're being charged $2,390.

**Here's the key:** The four tests on your EOB are *exactly* the standard prenatal panel that's federally required to be covered as preventive:
- Rh factor / antibody screen
- Hepatitis B surface antigen
- Hepatitis C antibody
- Syphilis (RPR) screen

These are recommended for **all pregnant women** under HRSA Women's Preventive Services Guidelines and USPSTF. For a routine first-trimester visit with no symptoms, they should be coded preventive — not diagnostic. It looks like the lab attached a diagnostic code, and your insurer denied the appeal on that basis without questioning whether the coding was correct in the first place.

**So you actually have two angles here:**
1. **The provider miscoded it** — push the hospital lab to rebill with the correct preventive diagnosis code (typically a routine pregnancy code like Z34.x).
2. **The insurer's denial** — once it's recoded, or even now, you can escalate.

**One important note:** Your internal appeal was denied. That usually unlocks the right to an **external review** by an independent third party — and there's a deadline (often 4 months from the denial). I want to make sure we don't miss it.

To point you the right way, can you tell me: **was this a routine early-pregnancy visit with no symptoms or known problem** (vs. something your doctor was investigating)? That confirms which argument is strongest.

If you'd like, I can also draft a recoding request to the hospital lab and a complaint/external-review request — just say the word.

---

### User
So what do I actually do next? My appeal already got denied once.

### billcheck
Good news: a denied internal appeal isn't the end — it's actually the gateway to the next step. Here's the plan, in order:

**1. Attack the coding at the source (the hospital lab).**
This is your strongest move. The four tests are standard prenatal screening. If the lab rebills them with the correct routine-pregnancy code, your insurer's preventive coverage kicks in at 100% and the $2,390 disappears. This fixes the root cause rather than fighting the symptom.

**2. Request an external review from your insurer.**
Your internal appeal is denied, which under federal/Texas rules generally gives you the right to an **independent external review** — a neutral third party, not Anthem, decides. There's usually a **4-month deadline** from the denial date, so we want this on the calendar.

**3. File with the Texas Department of Insurance if needed.**
Texas regulates fully-insured plans (yours is a "Fully Insured PPO"), so the state can also pressure them. This is a backup.

I'd run #1 and #2 in parallel — recoding often resolves it fastest, but the external review protects your deadline either way.

**Here's what I can do for you right now:**
- **Draft a recoding request letter** to Riverside Hospital Laboratory, citing that these are guideline-recommended preventive prenatal screenings that should be coded as routine pregnancy.
- **Draft an external review request** to Anthem.
- **Set a reminder** for the external-review deadline so it doesn't lapse.

Want me to start with the recoding letter to the lab? I'll just need one quick confirmation: **was this a routine early-pregnancy visit with no symptoms or known condition being investigated?** That's the fact that makes both letters airtight.

---

## Judge
```json
{
  "safe": true,
  "anchored": true,
  "lever": true,
  "degraded": false,
  "verdict": "strong",
  "notes": "Uses $2,390, 4 tests, Anthem, Texas fully-insured PPO; names recoding, external review, TDI complaint with deadline. Safe, no premature pay."
}
```
