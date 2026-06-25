---
title: billcheck v1 — the persistent advocate (requirements)
status: draft
created: 2026-06-25
origin: docs/brainstorms/billcheck-prototype-requirements.md
---

# billcheck v1 — requirements

Turn the validated, stateless prototype into a **persistent advocate**: it remembers the
case, does the next step (drafts the artifact), tracks deadlines, and ends with something
the user can share. The model's reasoning is already strong and safe (see
[docs/observations/SUMMARY.md](../observations/SUMMARY.md)) — **v1 builds the hands and the
memory around it, not better answers.**

## Why now
The 31-case + real-case testing settled the open question: the Opus baseline triages
strongly and safely on its own. So the reason to use billcheck **instead of ChatGPT** can't
be "better advice" — it has to be the things a foundation model structurally can't do:
**remember the case, act in the real world, and be trustworthy enough to hand your bill to.**

## North star (context, NOT v1 scope)
A healthcare-transparency company (data + movement), built *as* a great consumer
bill-fighter. Build the company by being the tool. v1 is the tool; the price index, public
pressure, and benefits navigator are the destination it accrues toward.

## Primary user & the job
The scared individual (~30–55) who just got an unexpected bill (hundreds–thousands), lands
from a social ad **emotionally primed and low-confidence**, and wants it *handled*, not
explained. **Job:** take them from "what is this / do I owe it?" → "it's handled — drafted,
tracked, and I know what's next." The first screen should feel like relief, not homework.
- GTM positioning is **D2C**; Wellthy is a channel/pilot/data partner pitched on
  productivity + their-own-data + a new offering (kept walled off from the transparency story).

## Success criteria (v1)
A person uses billcheck instead of ChatGPT because it **(1)** remembers their case across
visits, **(2)** produces the actual artifact (not just advice), **(3)** proactively nudges
the deadline, and **(4)** a finished case yields a share card. Demoable end-to-end on Vercel.

## Requirements

### Accounts & consent
- **R1.** v1 is **signup-first** (simpler to build/test; everything hangs off a user).
  *Anonymous-first + feature-gating moves to v1.1 — it's a launch-critical conversion lever,
  and its real cost is the anonymous→account **migration**.*
- **R3.** Two consent tiers (full UX is v1.1 with anonymous mode): anonymous→anonymized
  aggregate (disclosed, opt-out); account→personal persistent (explicit opt-in). Plain
  language, "you own it." v1 collects the account-tier consent at signup.

### The case model (core deterministic build)
- **R4.** A **case** is a first-class object holding the bill(s), EOB(s), uploaded docs, the
  profile, a timeline of actions, and deadlines.
- **R5.** Document linking: know which EOB/doc belongs to which bill; don't lose the thread
  as the user piles on new uploads.
- **R6.** **One active session per case**; prior sessions are stored **transcript objects**.
  The active session is seeded with a **case summary + structured state** (not raw old
  transcripts), and can pull a stored transcript only if needed.
- **R7.** Cross-case awareness: handle multiple bills, surface connections, contest related
  items together — without losing track of each object/action.
- **R8.** Stored situation/profile: insurance + status (veteran, Medicaid/QMB, household
  income, …) persisted and applied across sessions — ask once, reuse, proactively apply.

### Execution (the hands)
- **R9.** Artifact generation: produce the real artifact it already drafts well
  (dispute/appeal/complaint/call script), **personalized from the stored profile** (fill the
  blanks).
- **R10.** Deliver: v1 = render to **download/print/copy**; real send (fax/mail/email, likely
  paid) is **mocked** in v1 — but mark the artifact "sent" on the timeline so tracking stays
  coherent. Real send → v1.1+.
- **R11.** Artifacts + their deadlines are saved to the case as tracked objects.

### Proactivity & trust
- **R12.** **Smart reminder** (the agentic centerpiece; a Vercel Workflow — durable,
  scheduled, pause/resume): at a deadline it checks case state and **tailors or suppresses**
  the nudge. v1 "new info" = **user-side changes** (did they add anything?); external signals
  (EOB posted, provider replied) need deferred integrations. Channel = email.
- **R13.** *Deferred.* No cited-KB/retrieval in v1 (real build; model is already fairly
  accurate). Interim trust = the model's existing hedging; **add nothing that pressures it
  toward confident false specifics.** R13 later merges with R14 — your own outcome data
  becomes the citation.

### Growth & data
- **R14.** Data capture from user #1: per analyzed bill, store an **anonymized structured
  record** — service/CPT or type · provider type + coarse geography (state or ZIP3, never
  exact) · billed / allowed / paid / patient-responsibility · the issue (duplicate, OON,
  preventive-miscode, QMB…) · lever suggested · outcome *if/when known*. Strip all PII; store
  separate from the personal case; disclosed-anonymized consent tier. v1 just **accrues
  records** — index/product later; outcomes fill in over time via the report-back loop.
- **R15.** **Share card (simplified):** generate a **generic** card when a case **"ends,"**
  for every case. *Trigger:* the model flags it has **delivered its conclusion** (structured
  signal) → offer the card inline; **plus a persistent "recap/share" button** always
  available as the backstop. Card is anonymized, no PII, user can download/share. *Deferred:*
  nicer card design, selective "legible-win" gating, and the public-wall / journalist tiers
  (need right-of-reply guardrails).

### AI scaffolding (not prompt-tuning)
- **R16.** Treat the system prompt as **~frozen** — changes need a reason + a visible
  before/after. Build capability via **tools** the model calls (save case, set reminder,
  generate artifact, flag conclusion), memory, and structured state — the deterministic,
  testable layer where the wedge lives.

## Scope boundaries
- **In v1:** R1, R3 (account tier), R4–R12, R14, R15 (generic), R16.
- **Deferred (v1.1+):** anonymous-first + migration (R1/R3 full); real send (R10); cited KB
  (R13); rich external reminder signals (R12); nice/ selective share card (R15).
- **Out (north-star, not now):** insurance-portal connect (Granted = swamp); MyChart/clinical
  integration; public price-index product; journalist/outrage pipeline; benefits navigator;
  GFE/upstream prevention; Wellthy/employer software integration; pricing / pay-what-you-want.

## Key decisions
1. **D2C** customer; transparency company as north star, built as a bill-fighter.
2. **Freeze the prompt**; invest in deterministic scaffolding (the model is good — leave it).
3. **Signup-first** for v1 (anonymous is a v1.1 conversion lever).
4. **One active session**; history = transcript objects + a case summary.
5. **Mock send** in v1; **smart reminder** is the agentic showcase.
6. **Defer cited sources**; merge into the data asset later.
7. **Generic share card on case-end**, triggered by a model "conclusion" flag + manual button.

## Assumptions & dependencies
- Ships on **Vercel** (Workflows + agents in play); **Opus via the AI Gateway**.
- Persistence needs a datastore + auth (selection is a planning decision).
- Email send for reminders (a provider — planning decision).
- Pedro's bottleneck is understanding/testing → favor **visible, deterministic** features;
  the **Wellthy real-case loop** is the stronger eval than solo testing.
- Keep it **simple and positive**.

## Saturday hackathon slice (7 hours, demoable core)
**signup (pre-seeded for demo) → upload a real bill → it analyzes → drafts the artifact
(download) → saves the case + deadline → smart reminder (the Workflow) → generic share card
on conclusion.** That's *memory + hands + proactive-nudge + share* in one flow — and the
smart reminder is the headline "agentic" moment.

## Open questions
- R15: confirm the "conclusion delivered" trigger vs. a manual-only button for v1.
- R10: any v1 send at all (even email), or pure mock?
- R14: exact field set + the consent disclosure copy.
- Datastore + auth choice (planning).
