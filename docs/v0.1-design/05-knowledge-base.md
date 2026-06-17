# V0.1 design — Q5: The knowledge base

> **Status: LEADING (V0.1).** Brainstorm output. Not gospel. Entry: [../START-HERE.md](../START-HERE.md).
> Grounded in [../v0.1-cases/SYNTHESIS.md](../v0.1-cases/SYNTHESIS.md). _2026-06-17._

## Why the KB is core, not peripheral
The synthesis is blunt: **the agent's quality is bounded by the KB's accuracy and freshness**, and
**the legal landscape shifts** (CO HB1380, WV prior-auth reform, H.R. 1 retroactive-Medicaid cuts,
Braidwood, Alexander v. Azar). Most patient losses are **non-assertion of an existing right** — so the
KB (which encodes those rights, their conditions, and their clocks) is where the product's leverage
actually lives. This is a first-class subsystem, not a doc folder.

The KB operationalizes the **situation → lever map**: given a situation + problem, return the
applicable levers with the conditions to qualify, the deadlines, and the citations to back the claim.

## The rule schema
Each KB entry is a structured, **citeable** rule (so the Provenance principle can reference it by id):

```
rule:
  id:            kb:aca-2713-preventive            # stable, citeable id
  title:         "ACA §2713 — $0 cost-share preventive services"
  jurisdiction:  federal                            # federal | state:<XX>
  coverage_types: [commercial-fully-insured, commercial-self-funded, aca-marketplace]
  problem_tags:  [preventive-vs-diagnostic, unbundled-supply, mixed-visit, site-of-service]
  lever:         "Argue the service is USPSTF/HRSA-graded preventive → $0 cost-share; demand recode/reprocess."
  qualifies_when: "service maps to a covered preventive code AND was screening (not diagnostic/symptomatic)"
  does_not_apply_when: "visit was diagnostic/symptomatic; grandfathered plan; non-graded service"
  clocks:        [{name: internal-appeal, window: "180d from EOB"}, {name: external-review, window: "4mo (varies by state)"}]
  actions:       [draft-appeal, draft-doi-complaint, request-recode]   # artifact-drafting hooks
  citations:     [{label: "45 CFR 147.130", url: "...", as_of: "2026-01"},
                  {label: "KFF preventive services", url: "...", as_of: "2025-11"}]
  effective_date: "2010-09-23"
  version:       "2026-01"
  last_reviewed: "2026-06-17"
  confidence:    high          # high | medium | low (low ⇒ agent must hedge + suggest verification)
  notes:         "Braidwood v. Becerra context for USPSTF A/B services; mixed-visit = charge only non-preventive part."
```

Key fields that earn their place:
- **`jurisdiction` + `coverage_types`** — the routing keys; the agent retrieves by **situation**.
- **`qualifies_when` / `does_not_apply_when`** — turns "there's a rule" into "does it apply *here*."
- **`clocks`** — feed the deadline scheduler; missing a clock is a top failure mode.
- **`actions`** — link a rule to the artifact-drafting tool (rule → letter).
- **`citations` + `as_of` + `version` + `last_reviewed`** — freshness and the provenance source trail.
- **`confidence`** — low-confidence rules force the agent to hedge and recommend human/expert verification.

## Organization (by the situation → lever map)
Top-level buckets mirror the synthesis table:
- **Uninsured/self-pay:** 501(r)/charity care, GFE→PPDR, cash/prompt-pay + benchmark, IRS Form 13909, hardship/bankruptcy.
- **Commercial in-network:** ACA §2713 preventive-$0, coding/modifier/NCCI, internal→external appeal, site-of-service/facility-fee, DOI.
- **Commercial OON/surprise:** NSA + its loopholes (emergency-by-route, medical-necessity denial, post-visit consent, IDR-too-costly), state surprise laws (FI only), employer broker, external medical review.
- **Medicare FFS:** timely-filing/assignment (provider-can't-bill), observation-status/Alexander, redetermination→QIC→ALJ→MAC→court ladder + clocks, Medigap-follows-Medicare.
- **Medicare Advantage:** org-determination→IREO→ALJ ladder, expedited/QIO/NOMNC tracks, algorithmic-UM guidance, directory-accuracy/network-adequacy.
- **Medicaid/QMB:** balance-billing prohibition, out-of-state emergency coverage, retroactive eligibility (+ H.R. 1 changes).
- **COB:** birthday rule, primary/secondary order, ERISA vs state venue.
- **Collections/legal (cross-cutting):** FDCPA, answer-the-summons/never-default, payoff negotiation, vacate-default, SOL, credit-bureau disputes.
- **Cross-cutting levers:** benchmark-vs-market, negotiate, payment plan, charity, **press/public** (with guardrails).

## Seeding the KB
The **31 cases are the seed corpus** — every case already lists its levers, clocks, and citations.
The build task is to lift those into structured rules (most already drafted in the segment files), then
fill obvious gaps. The case files double as **fixtures** for testing retrieval (case → expected rules).

## Freshness & versioning (a hard requirement)
- Every rule carries `version`, `effective_date`, `last_reviewed`, and per-citation `as_of`.
- The agent **surfaces "as-of" dates** to the user for anything time-sensitive (esp. shifting law).
- A **review cadence** flags rules past a staleness threshold; low-confidence/stale rules trigger hedging.
- Track **pending changes** (e.g., H.R. 1 retroactive-Medicaid taking effect Jan 2027) as future-dated versions.

## How the agent uses the KB
1. Triage establishes **situation + problem tags**.
2. KB lookup returns candidate **rules**, filtered by `qualifies_when`.
3. Rules supply: the **verdict's basis** (cited), the **lever options** (ranked), the **clocks** (scheduled),
   and the **drafting hooks** (rule → letter).
4. Every asserted right/number cites a **rule id** → satisfies the Provenance principle.

## Open questions
- Build vs. buy for the legal/billing content — how much can we license vs. must we curate?
- Retrieval mechanism: structured filter on `coverage_types`/`problem_tags` first, then semantic? (probably both)
- How do we keep state-by-state rules (50× surprise-billing/SOL/charity variants) maintainable? (templated rules + per-state overrides)
- Disclaimer posture: KB output is **information, not legal advice** — where/how to surface that without nagging.
