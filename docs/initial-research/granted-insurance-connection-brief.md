# Granted Health — How "Connect Your Insurance Account" Works (and is it hard to replicate?)

**Date:** 2026-06-16
**Purpose:** Brainstorming/planning input. Granted markets "connect your health insurance
account" as a headline capability. This brief explains the actual mechanism, how they reach
"most insurers," and how hard that part is to replicate for billcheck.
**Method:** Web research, June 16 2026. Granted's own pages were read via search index
(their site 403s direct fetch). Every claim below is tagged by source tier — see legend.

> **Source legend:**
> `[OFFICIAL]` = Granted's own site/guides/blog · `[REPUTABLE]` = vendor docs, established
> press, company-data sites · `[ONLINE]` = forums/reviews (thin here — see Caveats) ·
> `[INFERENCE]` = our analysis/reasoning from the above · `[TRAINING]` = general domain
> knowledge not tied to a specific source.

> **Correction to our existing note:** the Granted addendum in
> an earlier competitive brief (now archived) describes this as
> "EOB monitoring via **OAuth** to 1,300+ insurance/patient portals." The more precise
> characterization is **credential-based portal login (not OAuth)** — see "What's actually
> happening" below. The distinction matters for security, compliance, and how hard it is to copy.

---

## TL;DR

1. **It's credential-based account aggregation, not a standards API.** `[OFFICIAL + INFERENCE]`
   The user types their **insurer-portal username + password into Granted**, relays an **MFA
   code**, and Granted logs in on their behalf and **imports claims + benefits** (it warns this
   can take ~30 min). A separate **HIPAA authorization** lets Granted's humans *act* (call
   payers, appeal, dispute). The data-pull and the act-on-your-behalf authority are two
   different mechanisms.
2. **Breadth ("1,300+ insurances and patient portals") can only come from portal-login
   automation / scraping.** `[OFFICIAL number + INFERENCE]` The clean FHIR route (CMS Patient
   Access APIs) only covers ~350–433 payers and *redirects to the payer's own login* — it can't
   explain either the 1,300 figure or the "type your password into our app" flow.
3. **Replicating the concept is easy; replicating the breadth + upkeep is a grind.**
   `[INFERENCE]` You can match most of the *felt* coverage fast (buy FHIR for top payers +
   great upload/parse). Matching the literal long tail of 1,300 portals via credentials is a
   multi-quarter build with a permanent maintenance + compliance tax.
4. **You can't just buy the long tail anymore.** `[REPUTABLE + INFERENCE]` The historical
   credential-aggregation vendor, Human API, was bought by LexisNexis (2023) and repositioned
   to B2B/underwriting. That's likely *why* Granted appears to do it in-house.
5. **The reframe that matters: "most insurers" by portal *count* is hard; "most insured
   *people*" by *coverage* is not.** `[INFERENCE]` The top ~20–30 payers cover the large
   majority of insured Americans — you do not need 1,300 on day one to be competitive.

---

## What the user actually does (the flow) — `[OFFICIAL]`

From Granted's own connect guides (general page + per-payer guides, e.g. Aetna, Anthem):

1. In the app, start adding a plan and **search/select your insurer**.
2. **Enter the username + password you use for your insurer's online portal** (if you've never
   registered on, e.g., the Aetna site, you must create that online account first).
3. If the portal has **MFA**, Granted **prompts you to choose where to send a security code**
   (phone/email) and you relay it.
4. Once connected, "it may take up to **30 minutes** for all your **claims and benefits**
   information to be imported."
5. You separately **sign a HIPAA authorization** so Granted can act on your behalf; each family
   member signs their own.

Other official facts:
- "Granted securely connects with **over 1,300 insurances and patient portals**." `[OFFICIAL]`
- Fallback path: "connect your insurance **or upload medical bills and EOBs**." `[OFFICIAL]`
- Creating an account, connecting insurance, and opening cases are **free**. `[OFFICIAL]`
- Public engineering blog mentions a TypeScript monorepo + Graphite stacked PRs — i.e., a real
  eng team, but nothing there reveals the connection layer's internals. `[OFFICIAL]`

## What's actually happening under the hood — `[OFFICIAL facts + INFERENCE]`

The combination of **(a) entering a raw portal password into Granted, (b) Granted driving the
MFA step, (c) a ~30-min async import, and (d) 1,300+ "insurances and patient portals"** is the
signature of **credential-based aggregation / portal-login automation (RPA / scraping)** — not
a standards API. Two tells rule out the pure FHIR/OAuth model:

- **Scale.** Only ~350–433 U.S. payers expose CMS Patient Access FHIR APIs; **1,300+** insurer
  *and* provider portals is far beyond that universe. `[REPUTABLE: Flexpa data] + [INFERENCE]`
- **The app captures the password and orchestrates MFA.** In a true OAuth/SMART-on-FHIR flow
  the user is **redirected to the payer's own login** and the app never sees the password or
  runs the MFA chooser. `[REPUTABLE: Flexpa/Fasten docs]`

The HIPAA authorization is a *separate* legal mechanism — it's what lets Granted's human
advocates phone insurers and file appeals/disputes; it is not how the data is pulled. `[OFFICIAL]`

**Open, unconfirmed:** whether the portal-login layer is **in-house** or an **undisclosed
third-party aggregator**. No reachable source names a vendor, and Granted's privacy policy
publishes no subprocessor list. Best guess is in-house (see point 4 in TL;DR), but unverified.
`[INFERENCE — flagged uncertain]`

## How this differs from the FHIR / "Patient Access API" approach — `[REPUTABLE]`

The clean, standards-based way to "connect insurance" (what billcheck would more likely buy):

| | Granted's apparent approach | FHIR Patient Access (Flexpa / 1up / Fasten) |
|---|---|---|
| Login | User types password **into Granted**; Granted drives MFA | User **redirected to payer**; app never sees password |
| Coverage | "1,300+ insurances/portals" (long tail incl. provider portals) | ~350–433 payers (Flexpa: 433 in prod) |
| Tech | Per-portal scraping/RPA | One OAuth/SMART-on-FHIR integration |
| Data | Claims + benefits (as shown in portals) | FHIR `ExplanationOfBenefit`, coverage |
| Brittleness | High — portals change, fight bots | Low — versioned API contract |
| Compliance load | High — stores/relays user passwords + MFA | Lower — token-based, no password custody |

(See the existing brief's "Data-Access Feasibility" section for Flexpa pricing — $20K/yr Builder
→ $350K Omni — and why FHIR only reaches ~35–45% of insured Americans because self-funded
employer plans have no API mandate.) `[REPUTABLE]`

## Is it hard to replicate? — `[INFERENCE / TRAINING]`

It splits into an easy part and a genuinely hard part.

**Easy / table-stakes (weeks, mostly buy):**
- **FHIR Patient Access** for the big payers — buy Flexpa, 1upHealth, or Fasten and get the top
  ~350 payers via one integration.
- **Upload + AI parse** of bills/EOBs — we largely have these pieces already (engine + LLM).

**Hard / the real moat (quarters, mostly build + forever-maintain):** the long tail of ~1,300
portals via credentials. What's hard isn't any single scraper — it's:
1. **No standard.** Every portal is a bespoke web app → one custom integration per insurer,
   times hundreds.
2. **Anti-automation defenses.** MFA/OTP relay, CAPTCHAs, device fingerprinting, lockouts —
   portals actively fight bots.
3. **A maintenance treadmill.** Portals change markup/auth constantly; scrapers break silently.
   This is ongoing OpEx and a dedicated team — *this* is the durable advantage, not the initial build.
4. **Credential handling = compliance + legal load.** You'd store/relay users' passwords and
   MFA codes (HIPAA, SOC 2, secrets management, large breach blast radius), and many insurer
   ToS prohibit credential sharing / automated access — a real gray area.
5. **Normalization.** Each portal exposes claims/benefits/EOB differently; all must map to one schema.

**On buying the hard part:** there is no clean, off-the-shelf consumer-grade credential
aggregator for insurance today. Human API (the historical leader) → acquired by **LexisNexis
Risk Solutions (2023)**, repositioned to B2B/underwriting. So "buy the 1,300 long tail" is not a
simple plug-in — which is consistent with Granted building it themselves. `[REPUTABLE + INFERENCE]`

**Note our own prior read:** the existing brief flags **Sheer Health** as also doing
insurance-account connection via credentials — i.e., credential-scraping is the known workaround
for the self-funded-employer EOB API gap. Granted is the same pattern at larger advertised
scale. `[OFFICIAL/REPUTABLE — from existing brief]`

## What this means for billcheck — `[INFERENCE]`

1. **Don't chase 1,300 portals.** Match *felt* coverage instead: buy FHIR for the top payers
   (covers the majority of lives), build credential scrapers only for the **highest-volume
   insurers our actual users carry**, and keep **upload + AI parse** as the universal fallback.
2. **The "1,300" headline is a breadth/maintenance moat, not deep tech.** Replicable, but it's a
   sustained investment; the compliance posture + the HIPAA-authorized human-advocate layer are
   as much of the moat as the scrapers.
3. **Coverage of *lives* ≠ number of *portals*.** Top ~20–30 payers (UnitedHealthcare,
   Elevance/Anthem, Aetna/CVS, Cigna, Kaiser, Centene, the BCBS plans, + CMS for
   Medicare/Medicaid) cover most insured Americans. Sequence portal builds by where our users
   actually are.
4. **Decision to brainstorm:** do we even want password custody? FHIR-first + upload avoids it
   entirely and fits our PHI-grade posture; credential scraping buys breadth at a real
   security/compliance/maintenance cost. This is a strategic fork, not just an eng task.

## Open questions / suggested next moves

- **Confirm in-house vs vendor.** Try to pull Granted's full privacy policy / App Store privacy
  labels / any job post naming a data partner. (Unresolved as of this brief.)
- **Spec a build-vs-buy plan:** shortlist FHIR vendors (Flexpa/1up/Fasten) with current
  pricing + coverage, and a phased credential-portal roadmap keyed to billcheck's actual payer mix.
- **Quantify the fork:** estimate the ongoing maintenance headcount for N credential portals vs.
  the lives-coverage we'd get from FHIR + top-payer scrapers only.

## Caveats

- **`[ONLINE]` tier is thin.** Reddit is blocked to the research crawler and App Store reviews
  didn't surface connection-experience detail, so there's little independent *user-side*
  corroboration of the flow — it rests mainly on Granted's own copy `[OFFICIAL]`.
- **Vendor is unconfirmed.** In-house vs third-party aggregator is an inference, not a verified fact.
- **"OAuth" vs "credential" is an inference** from Granted's described UX + the 1,300 figure;
  high-confidence but not from an internal Granted source.
- Granted's site 403s direct fetch; its pages were read via search index. Re-verify before any
  launch/positioning decision. Pricing/coverage numbers (Flexpa 433 payers, etc.) drift.

## Sources

**Official (Granted):** How to connect your insurance account · Connect your Aetna account ·
Connect your Anthem account · grantedhealth.com homepage · "Codebase & Tools" eng blog ·
Granted vs. Reclaim / vs. Resolve blog posts.
**Reputable:** flexpa.com (docs + blog, incl. Flexpa Link/Consent, payer API reports) ·
1up.health (Patient Access API) · fastenhealth.com + Fasten docs/GitHub (SMART-on-FHIR) ·
LexisNexis acquires Human API — PR Newswire / Healthcare IT Today / LexisNexis press (2023) ·
Crunchbase / PitchBook / CB Insights (Granted, ex–Medbill AI) · Wellfound founder interview
(Julien Nakache, ex-Oscar) · Yodlee (Wikipedia — fintech credential-aggregation analog).
**Internal cross-refs:** an earlier competitive brief (now archived)
(Granted addendum + Data-Access Feasibility + Sheer Health) · `docs/vendors.md`.
