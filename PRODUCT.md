# PRODUCT.md — billcheck

This document explains the *intent* behind billcheck — the why that isn't visible from clicking through the demo. For setup see the README; for how we build see [`AGENTS.md`](AGENTS.md). For the deep source material, follow the links in [Where to read more](#6-where-to-read-more).

---

## 1. The thesis: a persistent advocate

**billcheck is memory + hands + data wrapped around an already-strong, deliberately frozen model.**

The bet is *not* that billcheck gives better answers than a foundation model. Testing settled that question (see [`docs/observations/SUMMARY.md`](docs/observations/SUMMARY.md)): a strong model — Opus 4.8 — already triages medical bills safely and well on its own, by default, with a minimal prompt. Across 33 simulations spanning 31 cases there were **0 weak responses, 0 safety failures, 0 hallucinated "you owe $X," and 0 premature "just pay it."** The model's reasoning is the floor of this product, not the project.

So the reason to use billcheck *instead of pasting your bill into ChatGPT* cannot be "smarter advice." It has to be the things a stateless chat structurally **cannot** do:

1. **Memory** — it remembers your case across turns, sessions, and weeks, and remembers *you* (your insurance, your status) across every bill you ever bring it.
2. **Hands** — it acts in the real world: it drafts the dispute letter, tracks the appeal deadline, and wakes itself up to remind you.
3. **Data + durability** — it is trustworthy enough to hand your actual bill to (per-user isolation, consent-gated everything), and it quietly accrues a de-identified picture of what care really costs.

The job-to-be-done is emotional as much as financial: take a scared, low-confidence person from *"what is this — do I even owe it?"* to *"it's handled — drafted, tracked, and I know what's next."* The first screen should feel like relief, not homework.

This is the model frozen in code today — `R16` in the requirements, shorthand throughout this repo for "the model is fixed; capability comes from everything around it." (North-star context, not v1 scope: the long game is a healthcare price-transparency company built *as* a great consumer bill-fighter, with the price-index data asset accruing underneath the tool.)

---

## 2. Design principles (locked decisions)

These are deliberate, and several of them are counterintuitive. They are the spine of the codebase.

1. **Chat-first, kept as-is.** Recognition, document reading, tone, and "ask for the one thing that moves it forward" already work. The chat surface (`app/chat-client.tsx`, `app/api/chat/route.ts`) is not up for an overhaul.

2. **Frozen system prompt + tool-based capability.** This is the defining architectural decision. The system prompt ([`lib/prompt.ts`](lib/prompt.ts)) is roughly three sentences and is treated as **frozen**: any change requires a stated reason, a visible before/after, and a re-run of the safety probe. The model gains *powers* by **calling tools we build and test** — never by prompt-tuning. Capability lives in the deterministic, reviewable layer, not in prose we nudge until it behaves. The 14 model-callable tools (`lib/tools/index.ts`) — set title, set status, update profile, link/relink/classify documents, generate artifact, mark sent, schedule/update/cancel reminders, mark resolved, reopen, generate share card — are how the model reaches into the world.

3. **The case is a first-class object.** A case holds the bill(s), the EOB(s), uploaded documents, an action timeline, and deadlines (`lib/db/cases.ts`, `lib/db/timeline.ts`, `lib/db/deadlines.ts`). Document linking keeps each EOB tied to its bill; cross-case awareness lets related items be contested together.

4. **One active session per case.** History is stored as transcript objects. The active session is seeded with a case **summary + structured state**, not raw replayed transcripts. As built, this is one growing session per case — roll-over/archive is in the schema but intentionally unwired, the simplest thing that works.

5. **Per-USER profile, reused across cases.** Insurance, status (veteran, Medicaid/QMB, household income, name), and data-share consent are keyed to the *user* — one row per user — and reused on every case (`lib/db/profile.ts`, the `updateProfile` tool). Ask once, reuse, proactively apply; `coverageSituation` routes the playbook. Per-case specifics (this bill's amount and issue) live on the case's own summary. *(Known v1 mismatch: this per-user data is currently surfaced inside the per-case drawer — a presentation bug, not a data-model bug. Account data belongs one level up.)*

6. **Mock-send-but-track.** v1 renders artifacts to download/print/copy. Real send (fax/mail/email, likely paid) is **mocked** — but the artifact is still marked "sent" on the timeline so tracking and reminders stay coherent. The drafting is real; only the delivery is stubbed.

7. **The smart reminder is the agentic centerpiece.** A durable Vercel Workflow (`lib/workflows/reminder*.ts`, `lib/reminder/state.ts`) survives restarts, wakes near a deadline, **re-checks live case state**, and tailors or *suppresses* the nudge before emailing it via Resend. v1's definition of "new info" is user-side changes; the channel is email. This is the clearest demonstration of "hands" — the product does something while you're not looking.

8. **Conclusion-triggered, anonymized share card.** When the model emits a structured signal that it has *delivered its conclusion*, billcheck offers a generic, PII-free share card inline, with a persistent recap/share button always available as a backstop (`lib/share/card.ts`).

9. **Signup-first.** v1 hangs everything off a user account and collects account-tier consent at signup. Anonymous-first onboarding is a deliberately deferred conversion lever, not an oversight (see [section 4](#4-what-is-deliberately-deferred-and-why)).

---

## 3. Safety posture

The headline safety behavior — **never tell a scared person to "just pay it," and never invent an amount owed** — is *not* hardcoded as a rule. It emerges from a strong model plus the frozen prompt, and it is held by **model choice + the safety probe**, not by a coded guarantee. (A coded guard/eval is a v1.01 candidate.) The prompt's whole posture is: work only from what the user actually shows you, lead with their real situation, say so and ask for the one thing that moves it forward when something is unclear, stay concise.

That choice is itself a safety control. On the *same* statement, a free-tier model said "pay $1,240"; Opus said "that's a statement, not your final bill — don't pay yet." The model is the guardrail.

The structural commitments layered on top:

- **Never premature "pay it"; never invent an amount owed.**
- **Figures grounded in the document.** Numbers come from the user's uploaded bill/EOB, read natively from a private Vercel Blob, not from parametric guessing. *(Known boundary: in chat, code/rule **interpretations** still come from the model's uncited training memory — the gap the deferred cited-lookup tool closes.)*
- **Anti-hallucination in artifacts.** External specifics — a CPT fact, an FDA clearance, a legal citation — are left as attributed **`[bracket]` placeholders**. No invented citations, no model-guessed specifics, never a vacated or outdated rule stated as fact. (This was motivated by the single highest-stakes risk found in testing: a confidently-asserted FDA clearance date inside a life-or-death appeal. The fix is an attribution nudge — *"have your doctor cite the 510(k)"* — not a guessed fact.)
- **De-identify, and consent before any aggregate.** The transparency dataset stores only PII-stripped structured records, under a disclosed-anonymized consent tier, kept separate from the personal case, with coarse geography only (state or ZIP3, never an exact location). Card generation is PII-free with user preview as the backstop (`lib/aggregate/deidentify.ts`).
- **Per-user RLS isolation.** Supabase Postgres row-level security; every tool and route runs inside a `withUser()` RLS-scoped transaction (`lib/db/index.ts`). One user's cases or profile cannot leak to another (verified in the probe).
- **Information, not legal or medical advice.** Calibrated hedging on unknowable numbers and odds; honest small-dollar proportionality ("this $67 balance may not be worth the fight"); managing worry, not only catching errors.

The two world-effecting tools — `generateArtifact` and `scheduleReminder` — are gated behind a `needsApproval` UI card. The approval step is both injection defense and agent/user parity: nothing reaches the outside world without a human pressing go.

---

## 4. What is deliberately deferred (and why)

These are scoped-out on purpose. They are the difference between a focused v1 and a bloated one — not missing pieces.

- **Cited lookup / retrieval tool.** A tool returning current, sourced, **dated** answers from grounded data (a curated rules library plus public CMS / Transparency-in-Coverage data), replacing today's `[bracket]` placeholders. This is the single most valuable next tool: it closes the one chat-side hallucination boundary. It eventually merges with aggregate capture — your own outcome data *becomes* the citation.
- **Structured aggregate capture.** Conclusion-time extraction (issue · lever · billed/allowed/paid/patient-responsibility · provider type · geo · outcome) feeding the de-identified keyless dataset. v1 plumbed the full safety apparatus — consent, keyless store, de-identify, skip-when-sparse — but **nothing feeds it yet.** The plumbing is laid; the tap is off.
- **Auth0 / anonymous-first onboarding.** Anonymous-first entry plus the anonymous→account migration plus feature-gating. This is the real conversion lever; its real cost is the migration, which is why it waits.
- **Real artifact send.** Actual fax/mail/email (likely paid), plus looking up the provider's contact info and multi-channel delivery — replacing today's mock-send-but-track.
- **Branding.** Product name, bot persona, voice, and welcome copy are warm placeholders today. This is a config-string change and Pedro's call, deliberately left until the product is right.

Plus a tail of smaller, well-understood backlog items (active-case context visibility, upload robustness, deadline-timezone display, share-card PII guard, profile-field structure, the code-vs-plain-language voice question that is a documented prompt-exception pending alignment) — all captured in the live notes.

**Out of scope entirely (north-star, not now):** insurance-portal connect, MyChart/clinical integration, the public price-index product, the journalist/outrage pipeline, a benefits navigator, GFE/upstream prevention, employer integration, and pricing.

---

## 5. Roadmap

The next build is the **v1.01+ backlog**, which lives — fully self-contained, prioritized, and current with live production testing — at:

- **[`docs/observations/v1-live-test-notes.md`](docs/observations/v1-live-test-notes.md)** — live prod acceptance log + the v1.01+ backlog.
- **[`docs/plans/2026-06-26-002-feat-billcheck-v1-01-next-build-plan.md`](docs/plans/2026-06-26-002-feat-billcheck-v1-01-next-build-plan.md)** — the v1.01 next-build plan.

The throughline of the roadmap is consistent with the thesis: every priority item adds capability through the **tool/data/memory layer**, not through prompt edits.

---

## 6. Where to read more

Do not duplicate these — read them.

- **v1 requirements (R1–R16 thesis, locked decisions, scope boundaries):** [`docs/brainstorms/2026-06-25-billcheck-v1-requirements.md`](docs/brainstorms/2026-06-25-billcheck-v1-requirements.md) — the canonical source of product intent. *(An earlier prototype requirements doc exists at [`docs/brainstorms/billcheck-prototype-requirements.md`](docs/brainstorms/billcheck-prototype-requirements.md); the v1 file supersedes it.)*
- **Testing finding (strong + safe baseline; 0 premature "just pay it"; figures grounded):** [`docs/observations/SUMMARY.md`](docs/observations/SUMMARY.md) — the evidence behind the "don't bet on better answers" thesis.
- **v1.01+ backlog / live test log:** [`docs/observations/v1-live-test-notes.md`](docs/observations/v1-live-test-notes.md).
- **The frozen system prompt (reference — do not re-quote at length):** [`lib/prompt.ts`](lib/prompt.ts).
- **The v1 build plan:** [`docs/plans/2026-06-26-001-feat-billcheck-v1-persistent-advocate-plan.md`](docs/plans/2026-06-26-001-feat-billcheck-v1-persistent-advocate-plan.md).