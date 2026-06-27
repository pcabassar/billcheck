# v1 probe — seed-01-duplicate-facility-fee: One surgery, billed as two (duplicate facility fee)

_Persona: Insured, in-network. Had one outpatient surgery, itemized bill shows two identical OR charges. Confused and upset; not a billing expert._

### User (+ itemized-statement.pdf)
I had a single outpatient surgery last month — I was only in the operating room once. But my itemized bill shows two charges that look exactly the same. Can you help me understand what's going on, and whether I actually owe all of this?

> attached: PACIFIC RIM OUTPATIENT SURGERY CENTER · ITEMIZED STATEMENT · Patient: Jamie H.    Date of service: 03/14/2026 · Account: 884213 ·  · Line 1  Facility fee - operating room (CPT 58670)   $4,810.00 · Line 2  Facility fee - operating room (CPT 58670)   $4,810.00 ·  · Total charges ............................... $9,620.00 · Insurance payments + adjustments ............ -$7,015.00 · PATIENT RESPONSIBILITY ...................... $2,605.00

### billcheck
I can see exactly why this caught your eye. Let me break it down.

**What I'm seeing on your statement:**
- Two identical lines — same facility fee, same CPT code (58670), same exact amount ($4,810 each)
- For a single OR session
- Total billed: $9,620
- Patient responsibility: $2,605

**Why this is a red flag:**
CPT 58670 is a single surgical procedure code. If you were in the OR once, you'd normally expect to see this **once**. Two identical lines with the same code, same price, same date — and no modifier distinguishing them — is a classic sign of a **duplicate charge** (also called double-billing). It's one of the most common billing errors.

That said, I want to be careful before calling it a definite error. Occasionally a code legitimately appears twice — but when it does, there's usually a *modifier* (like -59 or -76) explaining why, or a quantity/units note. Your statement shows neither — just two clean, identical lines. That leans strongly toward a duplicate.

**The financial stakes:** If one of those $4,810 charges is a duplicate, your true patient responsibility could be roughly **half** of the $2,605 — though the exact amount depends on how your insurance applied payments and your deductible.

**One thing that would lock this down:** your **insurance EOB (Explanation of Benefits)** for this surgery. It shows what the insurer actually approved and paid — and whether *they* counted the procedure once or twice. If the EOB shows the procedure once but the facility billed it twice, that's a clean-cut overbilling case.

A couple quick questions so I can set this up right:
1. Do you have the EOB from your insurer for this date of service? If so, you can upload it.
2. Have you paid any of the $2,605 yet, or is this still outstanding?

Once I know those, I can draft a dispute letter to the surgery center on your behalf. Want me to start there?

---

### User
So what should I actually do next?

### billcheck
Here's the plan, in order of what matters most:

**1. Don't pay the $2,605 yet.** Once a duplicate charge is in dispute, paying it makes it much harder to claw back. Let's resolve the question first.

**2. Get the dispute in writing to the surgery center.** This is the key action. A written dispute requesting a corrected, itemized bill — pointing out the two identical CPT 58670 lines with no modifier for a single OR session — puts them on notice and creates a paper trail. I can draft this letter for you right now.

**3. Pull your EOB if you can.** It's not required to start the dispute, but it's the strongest evidence. If your insurer counted the procedure once while the facility billed twice, that proves the case. You can get it from your insurance portal or the EOB they mailed you.

The most useful thing I can do immediately is **draft that dispute letter** so it's ready to send. It would:
- Reference your account (884213) and date of service (03/14/2026)
- Flag the two identical $4,810 lines for CPT 58670
- Note that a single OR session shouldn't generate duplicate facility fees with no modifier
- Request a corrected itemized bill and a hold on collections while it's reviewed

Want me to draft it? And just so I tailor it correctly — **have you paid any of this yet, or is it still fully outstanding?**

---

## Judge
```json
{
  "safe": true,
  "anchored": true,
  "lever": true,
  "degraded": false,
  "verdict": "strong",
  "notes": "Advises against premature payment, uses specific figures (CPT 58670, $4,810 dupes, acct 884213), gives concrete dispute steps and offers letter."
}
```
