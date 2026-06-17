# Agent architecture best practices (2025–2026) — brief for billcheck

> **Status: INPUT (V0.1).** Research synthesis on "orchestrator + tools" / agent-native architecture,
> mapped to our design. Feeds [../v0.1-design/03-agent-loop-and-tools.md](../v0.1-design/03-agent-loop-and-tools.md).
> Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17. Sourcing caveat: several primary pages (Anthropic
> eng, OpenAI PDF, Every) 403'd the fetcher — substance corroborated across sources; exact quotes verify-before-citing._

## The frameworks, distilled
- **Every Inc — Agent-Native Architecture** (Shipper/Klaassen; "How to Build Agent-Native," "The Folder Is
  the Agent"): **tools = atomic deterministic primitives; features are emergent** ("an outcome described in
  a prompt, achieved by an agent with tools in a loop"). **Composability is the payoff** — the app does
  things nobody explicitly designed. **The folder is the agent** (knowledge as versioned files any new
  model inherits). A static **`SOUL.md`** defines persona + **hard limits**. Skills bundle **Instructions
  (flexible) + Code (deterministic) + Resources (lookup)** — the discipline is *deciding what is Code vs.
  Agent*. → **Our Provenance principle is a specific instance: dollar amounts & verdicts are Code, never Instructions.**
- **Anthropic — Building Effective Agents:** *workflows* (LLM+tools on predefined paths) vs *agents* (LLM
  dynamically directs itself). **"Find the simplest solution; add complexity only when needed."** Patterns:
  prompt-chaining, **routing** (deterministic dispatch), parallelization, **orchestrator-workers**,
  evaluator-optimizer. Invest in the **agent-computer interface** (tool ergonomics; poka-yoke tools).
- **Anthropic — Context Engineering:** find "the smallest set of high-signal tokens"; attention is a finite
  budget ("context rot"). Right-altitude system prompts; **minimal viable tools** ("if a human can't say
  which tool to use, neither can the agent"); canonical examples not edge-case lists; **just-in-time retrieval**.
- **Anthropic — Long-Running Harnesses** (directly relevant to our weeks-long campaigns): **external
  artifacts as memory**, with three properties — **externalized** (written to artifacts, not held in
  transient context), **path-addressable** (reopen the exact object later), **compaction-stable** (survives
  truncation/restart/delegation).
- **Anthropic — Agent Skills** (open standard, Dec 2025): `SKILL.md` + progressive disclosure
  (discovery → activation → execution) keeps context lean while giving deep on-demand procedure.
- **Claude Agent SDK loop:** **gather context → act → verify → repeat.** The **verify** step is what makes
  agents reliable. **Writing Tools for Agents:** high-leverage (not thin wrappers); **return
  human-readable, structured facts** (names > opaque IDs — agents reason better, and are less tempted to
  invent); strict data models; evaluate-and-iterate on tools.
- **12-Factor Agents:** own your prompts / context / **control flow**; **tools are structured outputs that
  trigger deterministic code**; unify execution & business state; **small focused agents (~3–20 steps)**;
  contact humans via tool calls (HITL); compact errors into context; stateless-reducer.
- **OpenAI — Practical Guide:** **single agent + tools first**; multi-agent only when one agent's
  prompt/toolset is unwieldy; **layered guardrails**; explicit HITL gates for irreversible actions.
- **Single vs multi-agent (resolved):** Cognition "**Don't Build Multi-Agents**" — single-threaded + heavy
  context engineering; parallel subagents make conflicting assumptions (fragile, incoherent). Anthropic's
  multi-agent wins only for **read-heavy, parallel research** (~**15× tokens**). **Reconciliation:**
  multi-agent helps for read-only breadth; **hurts for stateful, decision-critical, coherence-sensitive
  work** — i.e. our advisor stays **single-orchestrator**.
- **Eval:** evaluate **trajectories** (which tools, order, params, interpretation), not just final outputs;
  **LLM-as-judge is a signal, not ground truth** (>50% error on complex tasks; ~64–68% expert agreement) →
  calibrate against humans; build a failure→annotation→regression loop.

## Recommendations for billcheck — keep / change / watch
**KEEP:** single conversational orchestrator (correct for stateful/decision/coherence work); the Provenance principle as a **Code/Instruction boundary**; KB/engine/parse/drafting/store as **discrete high-leverage
tools**; persistent advocate over one-shot.

**CHANGE (these update Q3/Q7):**
1. **Enforce the Provenance principle structurally, not by prompt.** Tools return **ID-bearing fact objects**
   (`{claim_id, cpt, billed, allowed, overcharge, rule_id, source_doc_id, confidence}`); **validate at the
   artifact boundary** — any dollar/verdict in a letter or summary must reference a `fact_id` from this
   case's tool outputs, else reject/flag. The model **narrates** facts; it never computes them. *(Confirms
   review P0-3 + matches our `validateLetter`.)*
2. **Deterministic pipeline, open-ended conversation.** Make the high-stakes path
   **intake → parse → audit → fact-generation** a **fixed workflow** (routing/chaining), not emergent
   agent behavior. Reserve open-ended agency for the **conversation**: recognizing the situation, what to
   ask next, which lever, how to frame, drafting strategy. *(This is the synthesis with Pedro's "reason
   like a human expert" principle — deterministic where numbers live; open-ended where judgment adds value.)*
3. **External, path-addressable, compaction-stable case state** — reload a **compact case summary
   just-in-time** each turn; never carry weeks of transcript in context.
4. **Package domain procedures as Agent Skills** ("how to appeal a denial," "how to read an EOB") —
   versioned, testable, progressive-disclosure.
5. **HITL via tool calls** for irreversible/outbound actions (send a letter, file a complaint).
6. **Trajectory + provenance evals from day one** (did it parse before auditing? does every number trace
   to a fact?), plus the failure→regression loop.

**WATCH (anti-patterns we're exposed to):** the **Provenance principle as prose** (biggest risk — enforce at the
boundary); **premature multi-agent** (keep specialists as tools/Skills under one orchestrator, not
parallel deciders); **context rot** over weeks (compact aggressively); **opaque tools** (raw IDs tempt the
model to invent); **skipping verify**.

## Sources
Anthropic: [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) ·
[Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) ·
[Long-Running Harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) ·
[Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) ·
[Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) ·
[Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system) ·
[Agent SDK](https://platform.claude.com/docs/en/agent-sdk/agent-loop). Every:
[Four Apps](https://every.to/source-code/how-to-build-agent-native-lessons-from-four-apps) ·
[The Folder Is the Agent](https://every.to/source-code/the-folder-is-the-agent).
[12-Factor Agents](https://github.com/humanlayer/12-factor-agents) ·
[OpenAI Practical Guide](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) ·
[Cognition: Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) ·
[LangChain: Multi-Agent](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems/).
