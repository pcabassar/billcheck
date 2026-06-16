# Rethink — agentic, chat/voice-first architecture (2026-06-15)

> **Status: LEADING (v2) — foundational thesis, NOT gospel.** The clearest statement of the core direction (especially the §5 bright line). But it's a Jun-15 decision doc, and we've learned things since — insurance-connect / system-of-record, the problem taxonomy — so treat it as **input to the brainstorm, to be revised**, not a spec. · Map: [V2-START-HERE.md](V2-START-HERE.md) · _classified 2026-06-16_

Trigger: Pedro's voice note (Jun 15). The feeling that we rushed, and that the
front end is "too linear, too old school." This doc takes that seriously,
lays the current architecture next to the one Pedro is describing, names the
one hard tension between them, and proposes a synthesis — then lists the
decisions only Pedro can make.

This is a decision doc, not a plan. Nothing here is built.

---

## 1. The reframe (read this first)

The instinct reads as "agent vs. pipeline," but that's not the real fork. The
real fork is **where the AI gets latitude and where it must not.**

The entire credibility of billcheck rests on one promise: *when we tell you a
charge is wrong by $498, that number is real and reproducible.* We bought that
promise by making the **verdict deterministic** — a typed engine + a rule
router, zero LLM in the decision. That is the asset. It's what Granted Health
and the others don't have (no published, testable method).

So the synthesis is not "rip out the determinism for an agent." It's:

> **An agentic, conversational shell around a deterministic core.**
> The agent gets wide latitude over *conversation, context-gathering, tool
> choice, explanation, and orchestration.* The agent gets ZERO latitude over
> *the numeric verdict and any dollar claim* — those stay in the engine, which
> becomes one of the agent's tools rather than the spine of a fixed pipeline.

Almost everything in the voice note fits inside that sentence. The rest of
this doc is about making it concrete and honest about cost.

---

## 2. What you're reacting to (your five points, steelmanned)

1. **Too linear.** The UI marches upload → confirm → triage → audit → verdict →
   plan. Every bill walks the same corridor. Reality is messier: some people
   have a scam text, not a bill; some already fought it; some just have a
   question.
2. **Bill as a record with status + history, AI with latitude.** Model each
   bill as a row with a status and a full activity log, then let the AI decide
   what to do next — backed by a real knowledge base and tools (calculators,
   web search) — instead of hardcoded routing.
3. **Chat as a first-class surface.** 2026-modern: don't click through
   screens; tell the app what you want and it shows you. Everything doable via
   chat.
4. **Voice.** Let people *say* it, not type it.
5. **Context/story on upload + non-bill inputs.** Let people narrate what this
   is and why they're unsure ("I never had this procedure," "this looks like a
   scam"). Sometimes there's no real bill at all. Context changes the audit.
6. **(implied) Deeper upfront research.** Map the *whole* space of medical-bill
   problems people actually have, load it into the knowledge base, and accept
   that it'll grow as real cases arrive.

Every one of these is, in my view, **directionally right.** Two of them
(2 and 6) carry a hidden trap that §5 addresses.

---

## 3. Current architecture (honest description)

What we built, and why it looks the way it does.

- **Shape:** a fixed pipeline. A Vercel Workflow (`processCase` → `auditCase`)
  drives state `CAPTURED → TRIAGED → AUDITED → VERDICT`. Each screen is a step
  in a corridor. The user can't skip, reorder, or ask a sideways question.
- **AI role:** deliberately tiny. Three single, constrained, structured-output
  LLM calls — classify, parse, letter-fill. No tool use, no loop, no autonomy.
- **Decision:** 100% deterministic. The engine (C1–C13) runs typed checks over
  reference tables; a rule router (D10) maps findings → verdict. No LLM touches
  it. This is the honesty guarantee.
- **Why it's like this:** two forces. (a) The hard June 27 hackathon deadline
  pushed us to the smallest demoable vertical slice — a corridor is the fastest
  thing to build and verify. (b) The HIPAA/PHI posture and the
  "never-claim-unverified-savings" principle made determinism feel safest.

**What's genuinely good and must survive:** the deterministic engine + router;
the PHI discipline (field-allowlist logger, ai_calls ledger, PHASE gate); the
append-only case event log; versioned reference data; the anti-phantom-savings
gates. These are the hard-won parts.

**What the voice note is right about:** the *shell* is rigid, narrow, and
dated. It assumes every user has a clean bill and a linear need. It can't
handle "here's a weird situation, help me think." The 13 checks are a small
island in a big ocean of medical-bill problems, and the UI exposes only that
island.

---

## 4. Proposed architecture (the v2 the voice note describes)

- **Bill = a record with status + a full, append-only activity log.** (We
  already have this: `cases` + `case_events`. This part is closer than it
  feels — what's missing is the *surface* over it, not the data model.)
- **A conversational agent is the primary surface.** Chat (typed and spoken).
  The agent reads the case record + history, talks to the user, and decides
  what to do next. Screens still exist, but as *rendered views the agent
  surfaces* ("here's what I found"), not a corridor the user is marched down.
- **The agent has tools, not a hardcoded flow:**
  - `runAudit(caseId)` — the deterministic engine (unchanged) exposed as a tool
  - `parseDocument`, `parseEob` — extraction
  - `lookupReference` — NCCI/MUE/PFS/CARC/FAP knowledge
  - `searchKnowledgeBase` — the medical-bill-problem corpus (§6)
  - `calculate` — bounded arithmetic helpers (NOT free-form "figure out the
    savings"; see §5)
  - `generateArtifact` — letters/guides
  - `webSearch` — current rules, a specific hospital's FAP page, a CARC code
  - state transitions, deadline setters, etc.
- **Context-rich, any-shape intake.** Upload a bill, paste a scam text,
  describe a situation out loud, or just ask a question. The agent figures out
  what it's looking at and what's worth doing — including "this isn't a real
  bill, here's why, here's what to do."
- **A real knowledge base** of medical-bill problem types, rights, and plays,
  retrievable by the agent, designed to grow from real cases.

This is a materially better product for the actual diversity of people's
situations. I agree with the direction.

---

## 5. The one hard tension — and the synthesis

**Points 2 and 6 say "give the AI a lot of latitude… tools to calculate
things." Taken literally, that destroys the asset.** If an LLM "calculates"
that you're owed $1,212, we are back to a system that can hallucinate a number
under a patient's name and put it in a dispute letter. That is the single
worst failure mode for this product — it's a trust and arguably a legal
problem, and it's exactly what the deterministic engine exists to prevent.

The resolution is a bright line, not a dial:

| The agent MAY (wide latitude) | The agent MAY NOT (deterministic only) |
|---|---|
| Converse, ask, interpret context | Decide the verdict |
| Choose which tools/checks to run | Compute any dollar amount it then asserts |
| Explain findings in plain language | Invent a finding, suppress one, or rescore one |
| Search the web for rules/policies | Claim savings that didn't come from a corrected-statement diff |
| Gather "story"/context, handle non-bills | Originate the numbers in a letter |
| Decide *what to do next* | Be the source of truth for *what is owed* |

Mechanically: **every number a user sees or a letter contains traces to a
deterministic source** — an engine finding, a parsed line item, a reference
table, or a verified diff. The agent orchestrates and explains; the engine
adjudicates. `calculate` is a set of *named, audited functions* (e.g.
"sum these line items," "apply this MUE"), never "LLM, do the math."

Get this line right and the voice note's vision and the honesty guarantee stop
being in conflict. Get it wrong and we have a confident liar.

---

## 6. The knowledge base (point 6) — what "more research" should produce

Today the product knows ~13 problem types (the checks). The real space is much
larger. A v2 knowledge base should be a structured corpus the agent retrieves
from, each entry: *problem → how to recognize it → what evidence proves it →
what the patient's lever is → what artifact/action helps.* A non-exhaustive
starter map (this is the research workstream, not a finished list):

- Billing-mechanics errors: duplicates, unbundling (NCCI), MUE, upcoding,
  wrong-patient/wrong-DOS, math errors, balance billing vs. EOB.
- Insurance/coverage: claim never submitted, wrong denial code, prior-auth
  denial, coordination-of-benefits failures, out-of-network surprise billing
  (No Surprises Act), timely-filing write-offs, COBRA/coverage-gap disputes.
- Self-pay/affordability: GFE breaches (PPDR), charity care / FAP (501(r)),
  prompt-pay and self-pay discounts, payment-plan rights.
- Collections/legal: FDCPA validation, credit-reporting of medical debt
  (recent CFPB changes), statute-of-limitations, "this is a scam/phantom bill."
- Process/rights: itemized-bill requests, medical-record requests, appeals and
  external review, state-specific protections.

The agent uses this both to *recognize* situations our 13 deterministic checks
don't cover and to *act* honestly within them (guidance and artifacts, even
where there's no numeric finding). It grows as real cases surface new patterns.

> Recommendation: this is worth a dedicated, sourced research pass (a
> web-research fan-out + synthesis into the corpus) before committing to v2
> scope. I can run it on your go.

---

## 7. What carries over vs. what gets rebuilt

| Asset | Verdict |
|---|---|
| Deterministic engine (C1–C13) + router | **Carries over** — becomes a tool, not the spine |
| Reference data + versioning + provenance | Carries over |
| PHI discipline (logger, ai_calls ledger, PHASE gate) | Carries over — *more* important (more tool calls) |
| `cases` + append-only `case_events` | Carries over — it's already the "record + history" model |
| Supabase schema, RLS, purge, claim path | Mostly carries over |
| Anti-phantom-savings / verified-diff logic | Carries over — the bright line in §5 |
| Single-call classify/parse | Carries over, but invoked by the agent, not a fixed step |
| **The linear workflow corridor** (`processCase`/`auditCase` as a fixed march) | **Rebuilt** — becomes agent-orchestrated; WDK likely still the durable substrate (see ROADMAP's WDK note — hooks/`DurableAgent` get interesting here) |
| **The click-through screen sequence** | **Rebuilt** — chat/voice-first; screens become agent-surfaced views |
| Verdict-as-endpoint mental model | **Rebuilt** — the case is a living thread, not a one-shot funnel |
| Hardcoded triage routing | **Rebuilt** — agent-driven, knowledge-base-backed |

This is a **significant rebuild of the shell, with the core preserved.** Not a
throwaway. Roughly: the engine/data/safety layers (maybe half the code we just
wrote) stay; the workflow + UI layers (the other half) get reconceived.

---

## 8. New risks this introduces (be honest before committing)

1. **Cost & latency.** Agent loops + web search + tool calls cost far more than
   3 fixed calls, and chat feels slow if every turn is a multi-tool reasoning
   loop. The spend alarm we built becomes load-bearing, not a backstop.
2. **Prompt-injection surface grows.** Free-text/voice context and web-search
   results are new untrusted inputs flowing into an agent that can call tools.
   The §5 bright line is also the security boundary: untrusted input can steer
   *conversation*, never *the verdict or a tool that mutates money/state
   without a guard.*
3. **PHI through more paths.** Web search especially — we must never send
   patient identifiers or document content to a search engine. Tool-level PHI
   guards needed.
4. **Reproducibility & eval get harder.** A deterministic pipeline is trivial
   to golden-test (we have 35 fixtures). An agent's behavior is
   nondeterministic; we'll need eval at the *tool-call* and *outcome* level,
   not just engine level.
5. **"Latitude" can quietly cross the line.** The discipline to keep numbers
   deterministic has to be enforced in code (tools that refuse to assert
   un-sourced dollars), not just in the prompt.
6. **Scope/timeline.** This is a v2, not a patch. The June 27 hackathon slice
   (if still a goal) is the *current* build; v2 is after.

None of these are blockers. They're the price, and they're payable. But they
argue for **deliberate planning** — the opposite of the rush you're flagging.

---

## 9. My recommendation

1. **Don't throw away the current build.** It de-risked the hard core (engine,
   PHI, data integrity, the reference/verdict honesty model) and proved the
   slice works end-to-end. Treat it as the validated core + a throwaway shell.
2. **Adopt the agentic, chat/voice-first shell as the v2 direction** — with the
   §5 bright line as a non-negotiable invariant written into AGENTS.md.
3. **Sequence it properly** (the antidote to rushing):
   - **(a) Research pass** → the medical-bill-problem knowledge base (§6),
     sourced and structured. *This is the upfront research you wanted.*
   - **(b) `/ce-brainstorm` then `/ce-plan`** on the v2 architecture — agent
     loop, tool contracts, the bright line, chat/voice UX, eval strategy.
     Genuinely brainstorm it; don't let me jump to building.
   - **(c) Build v2** behind the preserved core.
4. **Decide the hackathon question now:** is June 27 still a target? If yes,
   demo the *current* slice there and start v2 after. If no, we go straight to
   the research + brainstorm and don't polish the current shell.

I think you're right that we moved to building faster than the problem
deserved. The fix isn't to slow down the engineering — it's to do the
*thinking* (research + brainstorm) we compressed the first time, now that we
understand the shape well enough to do it properly.

---

## 10. Decisions for Pedro

1. **Verdict determinism — confirm the bright line.** Agree the agent never
   originates numbers/verdicts, only orchestrates and explains? (My strong
   recommendation: yes. This is the asset.)
2. **Scope of v1-of-v2.** Chat-first with screens as fallback, or chat-only?
   Voice in the first cut or fast-follow?
3. **Knowledge-base research pass — green-light it?** (I'd run a sourced
   web-research fan-out → structured corpus.)
4. **Hackathon (June 27)** — still a goal? Demo current slice, or skip?
5. **How much of the current shell to keep** as a fallback UI during the v2
   build vs. building v2 clean alongside the preserved core.

Next move on your word: run the research pass, or open a `/ce-brainstorm` on
the v2 architecture, or both.
