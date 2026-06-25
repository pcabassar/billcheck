# Testing LLM agents at scale — a simulation-first brief for billcheck

> How to test our agent by **simulating users** and "learn 100-at-a-time."
> Especially load-bearing
> under the **pure-greenfield** decision (we're rebuilding the engine/safety logic → testing is what
> guarantees correctness). _2026-06-17. Sourcing caveat:
> fetches were 403-limited; cited by canonical URL via search extracts — verify before quoting; 2026-dated
> arXiv IDs / vendor events flagged as leads._

## The one-paragraph answer
Build a small in-house **simulated-user harness** — the **"three-agent triangle"**: our agent ↔ an LLM
**user-simulator** (persona + goal) ↔ a **grader** — run it as a **batch over a persona population** swept
across billcheck's real routing dimensions, gated in CI. Keep **numeric/verdict checks as deterministic
assertions** (the Provenance principle is enforced in code, *not* judged); reserve **LLM-as-judge for free-text
quality** only. Run **offline on synthetic data** (no real PHI), self-hosted, against a BAA-covered model
endpoint. **Buy** a thin observability/dataset layer (self-hostable **Langfuse** or **Arize Phoenix**)
rather than building dashboards. ~100 multi-turn sims ≈ **single-digit minutes, ~$5–$50** a run.

## Simulated-user frameworks (precedents to model on)
- **DeepEval `ConversationSimulator`** (OSS) — define `ConversationalGolden`s (`scenario`,
  `expected_outcome`, `user_description`), wrap the bot in a `model_callback`, it plays a synthetic user
  turn-by-turn; multi-turn metrics (TurnRelevancy, RoleAdherence, ConversationCompleteness…).
- **LangWatch `Scenario`** (OSS) — the cleanest "few-hundred-LOC" reference: `agents=[YourAgent(),
  UserSimulatorAgent(), JudgeAgent(criteria=[...])]`; batch IDs; cached deterministic replays.
- **Promptfoo "Simulated User"** (OSS, τ-bench-inspired) — multi-turn + adversarial strategies
  (Mischievous User, Crescendo). _Flag: reported OpenAI acquisition 2026-03-09, said to stay OSS — verify._
- **LangSmith / LangGraph** — `create_llm_simulated_user` + trajectory evaluators.
- **τ-bench / τ²-bench (Sierra)** — the academic reference; **`pass^k`** measures *reliability* (prob. that
  **all k** trials pass; decays ≈ pᵏ — a 90% agent → ~57% at k=8). Anthropic model cards now report `pass^k`.

**Make sim users diverse (consensus — Hamel Husain / Shreya Shankar):** *not* "ask an LLM for 50 queries."
Do **error analysis → find the dimensions that vary behavior → generate across combinations** until no new
failures appear. Persona realism = specificity of `user_description`.
**Pitfalls:** (1) **compliance bias** (sim users too cooperative) → script **non-collaborative** personas
(impatient, digressing, incomplete); (2) **distribution mismatch** (sim ≠ real) → treat sim scores as a
**regression signal, not ground-truth UX**, and use **"N−1 replay"** (replay N−1 turns of a *real*
transcript, test the next turn); (3) **judge self-preference** → use a **different model family** for the judge.

## Platforms (2026) — multi-turn + self-host/HIPAA lens
Self-hostable OSS: **DeepEval** (+ Confident AI w/ HIPAA), **Promptfoo** (local evals, CI gating),
**LangWatch Scenario**, **Langfuse** (tracing/datasets; Cloud BAA), **Arize Phoenix** (OTel tracing,
air-gap), **Inspect (UK AISI)** (rigorous, sandboxed, Eval Sets retry/resume — regulator-grade). Managed:
**LangSmith** (HIPAA Enterprise), **Braintrust** (data-plane in your VPC; CI experiments), **Galileo**.
**Avoid building on OpenAI Evals' hosted platform** (reported sunset 2026 — verify). Voice specialists
(Coval/Hamming/Maxim) if/when we add voice.

## Methodology
- **Deterministic checks before judges** (Anthropic evals cookbook: code-based grading is "by far the best").
- **LLM-as-judge done right** (Hamel "critique shadowing"): **binary pass/fail** (not Likert) + a free-text
  critique folded into the prompt; **calibrate** judge↔human with **Cohen's κ** (~50 stratified traces);
  prefer **reference-based** judging; known biases = position/verbosity/self-preference. (Shankar's EvalGen
  / "Who Validates the Validators?" + "criteria drift".)
- **Offline (CI gate, pre-merge) + online (sample live traffic)** form a loop: **production failures become
  regression fixtures.** This is **eval-driven development** (write the eval first).
- **Asymmetric safety metric (the false-"pay it"):** frame as **recall on the dangerous class** (the
  false-negative "this is fine"); report **precision/recall separately** (accuracy lies under imbalance);
  treat a false-OK on a known-bad case as a **"never-event" hard CI gate**, not an average. Best of all:
  **make it impossible by construction** (deterministic guardrail + conservative default/abstention).
- **Tool-use correctness in layers:** L1 selection · L2 argument correctness · L3 result-utilization — as
  code assertions where possible.
- **Groundedness / "no originated number":** the literature now has the exact construct — **Proof-Carrying
  Numbers (PCN)** (tie every numeric span to a structured claim, verify each against a source, **fail
  closed** on unverified). _This **is** our Provenance principle, generalized._ (arXiv 2509.06902 — verify.)

## The "100 simulated users" workflow
Each sim conversation = one **example** in a versioned **dataset**; the population = one **experiment**;
score every outcome; render failures diffably. Run **multiple trials/scenario, track variance** (agents
are stochastic); grade the **trajectory** (tool calls + reasoning), not just the final message. **Fan-out**
with concurrency → ~100 finishes in single-digit minutes; ~**$0.10–$0.60** per 6–12-turn conversation →
**~$5–$50 / 100** (cheaper with a cheaper judge). **PHI-safe:** generate fully **synthetic** patients/
encounters with **Synthea** (FHIR/CSV), derive synthetic statements/EOBs; keep the **harness self-hosted**
and point only at a **BAA-covered model endpoint**. _("Synthetic = not PHI" is the prevailing reading but
fact-specific — get counsel/Expert-Determination sign-off.)_ **Build** the sim loop (few hundred LOC);
**buy/adopt** the dataset+tracing+diffing layer.

## Recommendation for billcheck
1. **Harness — BUILD** (`packages/eval-sim`, TypeScript to match the monorepo): the three-agent triangle,
   calling Claude through **our own (fresh, greenfield) agent-loop LLM client** so every sim call hits the
   ledger + guards; **different model family for the judge**.
2. **Persona population — DERIVE FROM OUR TAXONOMY** (don't free-form). Sweep the dimensions
   [SYNTHESIS](../cases/SYNTHESIS.md) proves load-bearing: **insurance situation** (7 values + FI-vs-
   self-funded + dual/QMB), **document type** (statement vs itemized vs EOB — gates the #1 verdict),
   **problem/lever**, and **behavioral persona** — incl. the **"non-assertion" default user** (just pays),
   **already-tried-and-failed**, **confused/low-numeracy**, **adversarial/non-collaborative**, and
   **prompt-injection / "just estimate what I owe"** personas. ~100 = a Latin-square sweep, **oversampling
   the dangerous "looks-fine-but-isn't" and "statement-mistaken-for-final-bill" cells.**
3. **Scorers — DETERMINISTIC GATES + a thin judge:** (a) **provenance / no-ungrounded-number gate**
   (PCN-style, BLOCKING — also the runtime guardrail); (b) **false-"pay it" gate** (recall on
   "something's off"; any false-OK on a known-bad case = never-event = CI fail; reward the conservative
   default); (c) **tool-trajectory** (right tool/args; didn't self-compute a verdict); (d) **lever-legality
   + clocks** (no state-law lever on a self-funded plan; QMB→$0; right deadlines); (e) **free-text quality**
   (LLM-judge, **non-blocking until κ-calibrated**).
4. **Datasets/tracing — BUY/ADOPT (self-hosted OSS):** Langfuse self-host or Phoenix.
5. **Data — SYNTHETIC ONLY:** the **31 cases** are journalism-sourced (already public, non-PHI) → golden
   scenarios as-is; generate the *volume* via **Synthea**. Keep everything in the PHASE-style "synthetic/
   own/anonymized only" lane.
6. **Acceptance bar (greenfield):** the engine golden fixtures' *properties* (anti-circular, injection-
   resilience, reproducibility) become the bar the **rebuilt** engine must pass, re-expressed for the new
   design. Use **N−1 replay** on the deep seed cases (01–03).
7. **Sequence:** (1) write the **deterministic provenance + false-OK gates first** (highest safety value,
   no judge needed); (2) harness + ~30 personas from the 31 cases; (3) expand to ~100 via Synthea sweep;
   (4) add the **calibrated** free-text judge last. One command (`pnpm eval:sim`) runs the population
   concurrently, writes transcripts+scores to Langfuse/Phoenix, and **fails the build** on any provenance
   violation, any false-OK never-event, or a regression in "something's off" recall.

## Sources
DeepEval [Conversation Simulator](https://deepeval.com/docs/conversation-simulator) ·
LangWatch [Scenario](https://github.com/langwatch/scenario) ·
Promptfoo [Simulated User](https://www.promptfoo.dev/docs/providers/simulated-user/) ·
LangSmith [multi-turn simulation](https://docs.langchain.com/langsmith/multi-turn-simulation) ·
τ-bench [arXiv 2406.12045](https://arxiv.org/abs/2406.12045) · τ²-bench [arXiv 2506.07982](https://arxiv.org/abs/2506.07982) ·
Hamel [evals FAQ](https://hamel.dev/blog/posts/evals-faq/) · [LLM judge](https://hamel.dev/blog/posts/llm-judge/) ·
Shankar [EvalGen 2404.12272](https://arxiv.org/abs/2404.12272) · [LLM-as-judge survey 2306.05685](https://arxiv.org/abs/2306.05685) ·
Non-collaborative users [2509.23124](https://arxiv.org/abs/2509.23124) · Proof-Carrying Numbers [2509.06902](https://arxiv.org/pdf/2509.06902) ·
[Langfuse](https://langfuse.com) · [Arize Phoenix](https://phoenix.arize.com) · [Inspect](https://inspect.ai-safety-institute.org.uk) ·
[Synthea](https://github.com/synthetichealth/synthea) · Anthropic [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
