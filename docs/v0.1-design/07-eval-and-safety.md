# V0.1 design — Q7: Eval & safety

> **Status: LEADING (V0.1).** Brainstorm output. Not gospel. Entry: [../START-HERE.md](../START-HERE.md).
> Grounded in [../v0.1-cases/SYNTHESIS.md](../v0.1-cases/SYNTHESIS.md). _2026-06-17._

## The two properties that matter most
1. **The bright line holds:** the agent never originates a dollar amount or a verdict — every number/
   verdict traces to a deterministic source. This is the product's trust foundation.
2. **No false "pay it":** the worst user-facing error is telling someone a bad bill is fine. Its cost is
   asymmetric, so eval and guardrails weight it heavily.

Everything below serves these two.

## Enforcing the bright line
- **Structural:** tools return typed, id'd facts; asserted numbers/verdicts must cite a source id
  (`finding:…`, `line:…`, `rule:…`, `doc-diff:…`). A **validator** between the agent and the user
  scans output for figures/verdicts and **flags/blocks any not backed by a source id**.
- **Eval:** a "groundedness" suite — for each test output, assert every dollar figure and every verdict
  resolves to a real source id, and that the cited source actually contains that value. Fabrication = fail.
- **Red-team:** prompts designed to bait the model into inventing a number ("just estimate what I owe"),
  confirm it refuses to originate and instead routes to a tool or asks for the document.

## Triage accuracy (the headline eval)
The **31 cases become a regression suite**. For each: input → expected **document type**, **insurance
situation**, **verdict**, and **lever set**. Track:
- **Document-type detection** (statement vs itemized bill vs EOB vs …) — gates the #1 verdict. Confusion matrix.
- **Insurance-situation classification** — the routing key; esp. fully-insured-vs-self-funded and dual/QMB.
- **Verdict classification** — with the **false-OK rate** (verdict-2 "pay it" when the truth is verdict-3
  "something's off") as the **primary safety metric**. Optimize recall on "something's off"; accept some
  over-referral to "let me verify."
- **Lever appropriateness** — did it propose the legally-available levers for that situation (no
  state-law lever on a self-funded plan; QMB → $0; etc.)?

Conservative-by-design: when situation/verdict confidence is low, the expected behavior is verdict 4
("I need one more thing") or 1 ("don't pay yet"), **not** 2.

## Citation / KB groundedness
- Every asserted right/rule cites a **KB rule id**; eval checks the cited rule exists, `qualifies_when`
  matches the case facts, and isn't **stale/low-confidence** without a hedge.
- Clocks: eval that the agent registered the **right deadlines** for the situation (missing a clock is a
  silent, high-cost failure — see the Medicare cases).

## PHI & data safety (carry from V0)
- **Storage:** Supabase Postgres + **RLS**; documents in Storage with per-user access; least-privilege.
- **Model calls:** single Anthropic client + the **`ai_calls` ledger** (every call logged) + the **PHASE
  gate**. Minimize PHI in prompts; redact where the task doesn't need identifiers.
- **Retention/deletion:** user can delete a case/document; define retention windows.
- **Audit:** the activity log doubles as an audit trail (who/what/when) — also the evidence chain for
  chargebacks/regulators.

## Security: prompt injection & untrusted model-rendered UI
- **Indirect prompt injection (OWASP LLM01)** is a live risk: a malicious **document/EOB/email** we parse,
  or provider text, could try to redirect the agent. Mitigations: treat all parsed/ingested content as
  **untrusted**; the engine's **injection-resilience** posture already applies (adversarial text in a line
  description must not change findings — keep that eval); never let ingested text escalate tool use without
  the bright-line/confirmation gates.
- **Untrusted UI surface:** since cards render from tool output, **don't auto-load remote images**
  (markdown-image exfiltration vector for PHI), **allowlist URL schemes**, and render from our **owned
  component catalog** (not model-authored markup) — which also fixes the accessibility risk (Q4).
- **Live-region reality check:** ARIA live regions are buggy across NVDA/JAWS/VoiceOver → **test with real
  assistive tech**, don't assume.

## Guardrails (content & action)
- **Not legal/medical advice:** KB output is *information*; surface a light, non-nagging disclaimer where
  it matters; recommend professionals for genuinely high-stakes/ambiguous calls.
- **Press/public:** opt-in only; truthful + substantiated (user's own story, from the activity log);
  provider right-of-reply; legal review of the public-"wall" mechanics before launch.
- **Action confirmation:** anything leaving the system (letter, complaint, press, "mark paid") requires
  explicit user confirmation; drafts are clearly drafts.
- **Honest expectations:** present **odds**, not promises; "won on paper ≠ made whole" — don't oversell.

## How we run evals
- **Golden set:** the 31 cases (+ grow toward the "30 more" and beyond) as fixtures with expected outputs.
- **Per-PR regression:** triage + groundedness suites run in CI; track the false-OK rate over time.
- **LLM-as-judge** for the free-text quality (clarity, faithfulness, no over-promising), with the
  deterministic checks (groundedness, clocks, lever-legality) as hard gates.
- **Human spot-review** of a sample each iteration, focused on the dangerous-error class.

## Open questions
- Exact false-OK tolerance and the confidence threshold for verdict-2 vs verdict-4.
- How to eval the **multi-week campaign** behavior (deadlines fired, cadence kept) — needs time-travel test harness.
- LLM-judge reliability for faithfulness — calibrate against human labels on the golden set.
