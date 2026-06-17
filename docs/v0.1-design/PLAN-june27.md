# billcheck V0.1 — Implementation Plan (June 27 2026 hackathon milestone)

> **Status: LEADING (V0.1).** The build plan, operationalizing the Q2–Q7 brainstorm + reuse inventory,
> grounded in the actual codebase (every reuse/adapt/drop claim verified against source). Built by the
> Plan architect agent, then revised by an independent fresh-eyes review (full findings in the
> **Review addendum** at the end). Not gospel. Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17._

> **⚠ Post-review resolutions (these supersede the body where they conflict — do these in Phase 0):**
> 1. **Run the agent loop on the existing shared LLM client, NOT a parallel Vercel AI SDK Anthropic
>    provider.** A second `@ai-sdk/anthropic` entry point silently bypasses the PHASE gate, spend
>    kill-switch, and PHI-logging (and the ESLint ban only catches `@anthropic-ai/sdk` by name). Add a
>    `converse()`/tools-mode to `packages/shared/src/llm/client.ts` (don't force `emit`; return tool-use
>    blocks for the caller to dispatch) → keeps every guard + the one-entry-point invariant for free.
>    Add `@ai-sdk/anthropic` to the ESLint `no-restricted-imports`. Size: ~1.5–2 days (the keystone).
> 2. **Keep `cases.state` in its existing vocabulary; do NOT repurpose it.** Repurposing breaks the
>    line-items edit guard, the INSERT-requires-`CAPTURED` branch, `rollback_provisional_case`, and
>    `EDITABLE_STATES`. Store the living-thread lifecycle as a narrated value in `coverage_profile` /
>    `case_events` (the agent narrates it anyway). Net DB migration for June 27 ≈ **zero** (or a tiny
>    additive one), not "one ~30-line trigger rewrite."
> 3. **The bright line is structural, not a stream-blocking regex.** Numbers/verdicts reach the user
>    **only** via tool-fact cards (VerdictCard/AmountsPanel) bound to tool outputs; the system prompt
>    forbids originating figures in prose. `validateLetter` stays fail-closed for artifacts (the real
>    bright line). The prose scanner is a **flag-only** belt-and-suspenders linter (you can't block a
>    stream the user has already seen). Eval the **structural property**, not the regex.

## 0. Codebase ground-truth (verified; deltas that change the plan)
1. **The engine is genuinely pure and DB-free.** `runEngine(input, refs)` + `routeVerdict(input)` are exported from `@billcheck/engine`; `referenceDataFromJson()` builds refs from plain JSON → **the engine runs with in-memory refs, no Supabase.** Trivial to wrap as a tool.
2. **The LLM client does NOT do an agentic tool-calling loop.** `packages/shared/src/llm/client.ts` forces exactly one `emit` tool (single-shot structured output, one retry). Great for parse/classify/letter-fill; **it cannot be the agent loop** — the loop is net-new (Vercel AI SDK) and needs its own Anthropic path. Central architectural tension (see §4, §8b, §9.1).
3. **There is no `bills` table.** `cases` directly own `documents`/`line_items`/`engine_runs`/`findings`/`verdicts`/`artifacts`/`deadlines` (two-level Case→Documents, not the three-level design). Core data-model gap (see §2).
4. **`cases.state` is hard-gated by a DB trigger** (`validate_case_transition()`, migration 0001) — only the 10 V0 states + a fixed transition graph. A living-thread lifecycle needs a migration. (Open Q 8d.)
5. **`case_events` is append-only + PHI-disciplined** (block-mutation trigger, allowlist payloads, auto-append on transition) → a ready-made **activity log**; reuse directly.
6. **The HITL + bright-line letter flow already exists end-to-end** in `apps/web/app/api/artifacts/route.ts` (loads findings → LLM fills bounded `{{FACTS_i}}` → injects dollars → `validateLetter` fail-closed → writes `case_events`). Nearly ready to wrap.
7. **Doc-type detection already exists** (`classifyDocument()`); but `DocumentKind` has **no separate `statement` vs `itemized bill`** — "itemized-ness" is a boolean on the parse. The #1 verdict is driven by `itemized:false` on a `bill`, not a distinct kind.
8. **No AI SDK / assistant-ui / shadcn installed** — the chat shell + generative UI is entirely net-new.
9. **Next.js 16 has breaking changes** — `apps/web/AGENTS.md`: "This is NOT the Next.js you know… read `node_modules/next/dist/docs/` first." Budget for streaming/route-handler surprises.
10. **PHASE gate is favorable:** dev + preview run `PHASE=B` (document calls work without per-account flags); production `PHASE=A`. No gate friction during the build.

## 1. Architecture overview
One **chat-first advisor**: a Next.js 16 route handler runs the **Vercel AI SDK agent loop** (multi-step `streamText` + tool-calling); the client uses `useChat` and renders **typed tool parts** into an **owned React component catalog**. The engine, KB, parse, and letters layer are **tools the agent calls** — the engine is one tool, never the spine. A **bright-line validator** sits between the agent's output and the user.

```
USER (types / uploads / pastes / forwards)
        │  message + optional file (composer "+")
        ▼
[Client] useChat ── POST /api/chat ──► [Server route]
   renders message.parts[]:                 streamText({ model: anthropic(MODEL),
     text → markdown bubble                    system: ADVISOR_SYSTEM (bright line + situation→lever),
     tool-<name> → OWNED card                  messages, tools, stopWhen: stepCountIs(8) })
       (skeleton on input-available,         AGENT LOOP: perceive→orient→decide→act→record
        card on output-available)                       │
   approval bubbles (needsApproval) ◄──────────────────┤
     Approve/Edit/Reject → addToolApprovalResponse ─────► TOOL DISPATCH
        ┌───────────────┬───────────────┬───────────────┬───────────────┬──────────────┐
        ▼               ▼               ▼               ▼               ▼
  parseDocument     kbLookup       runEngineTool    draftArtifact     caseStore
  (parse/classify   (filter rules  (runEngine +     (artifacts flow:  (read/write case,
   bodies via the   by situation+  routeVerdict;    LLM fills slots,  docs, amounts,
   SINGLE shared    problem →      in-memory refs   dollars injected, lifecycle,
   llm client)      rule:<id>)     → finding:<id>)  validateLetter)   activity)
        └───────────────── every tool returns TYPED, ID'd FACTS ──────────────────┘
                                       ▼
                       BRIGHT-LINE VALIDATOR (server, post-step):
            scan assistant text for $-figures + verdict words; each must resolve
            to a fact id surfaced by a tool this session (finding:/line:/rule:/eob:/
            doc-diff:). Unsourced → block/flag.  ▼  streamed to client
```

**Reused core:** engine+router → `runEngineTool` (unchanged); Anthropic client+ledger+PHASE+spendGuard → keeps serving the structured-output tools **and the agent loop** (~~a second AI-SDK entry point~~ → **superseded by Post-review resolution #1: run the loop on the shared client** so PHASE/spend/PHI/ledger all hold); letters+`validateLetter`+savings-diff → `draftArtifact` (bright line already built); Supabase schema/RLS/`case_events` → persistence + activity log; 10-check engine + D10 router + golden eval → the deterministic source + regression net.

## 2. Data model / schema — case → living thread
> **Superseded by Post-review resolution #2:** do **not** repurpose `cases.state` (it breaks the
> line-items guard, the INSERT-requires-`CAPTURED` branch, `rollback_provisional_case`, and
> `EDITABLE_STATES`). Keep `state` as-is and represent the living-thread lifecycle as a **narrated value
> in `coverage_profile`/`case_events`**. The rest of this section (amounts/situation/activity faked in
> JSONB + computed-on-read) stands; the net migration is ≈ zero, not "one trigger rewrite."

**Recommendation (original): minimal migration; lean on `coverage_profile` JSONB + `case_events`; defer the Bill table.** The June 27 demo is **one episode = one bill**, so a `bills` table buys nothing and costs schema/RLS/query rework.

**Migrate (one surgical migration `0010_living_thread.sql`):** relax `validate_case_transition()` to accept the new lifecycle vocabulary (`EXPECTED, NEW, GATHERING, REVIEWED, ACTING, RESOLVED, CLOSED, REOPENED`) and drop the rigid transition graph (allow any→any in V0.1; the agent narrates). Repurpose `state` to hold the new vocabulary (avoid a second source of truth). Keep the auto-append-to-`case_events` trigger. **This is the one migration that must happen.**

**Fake in app code (no migration):** amounts panel (derive billed/allowed/paid/owed/disputed on read from `documents.printed_total_cents`, parsed EOB fields, finding `amount_impact_cents`; a `lib/case/amounts.ts` helper); insurance situation (extend the `coverage_profile` JSONB / `TriageAnswers` zod with `coverageType` + fully-insured-vs-self-funded + dual/QMB); activity log (new `case_events` `type` values, no schema change); doc-type nuance (`itemized:boolean` from parse).

**Carries over unchanged:** all RLS owner-only policies; `case_events` append-only + triggers; the document/line-item/finding/verdict/artifact/deadline tables; `ai_calls` ledger; `ref_*` + `ref_versions`; private documents bucket; the `replace_line_items_and_finish` RPC.

**Net schema work: one ~30-line migration.** Bill table, amounts table, situation-snapshot table all **deferred** to fast-follow. _Caveat: dev/preview point at a live Supabase project — apply `0010` before the agent writes living-thread states; loosening is backward-compatible with the old enum._

## 3. Phased, sequenced build plan
Ordering: a thin end-to-end chat→tool→card path lights up by Day 2–3, then layer verdicts, the engine lever, the letter. Each phase is demoable.

**Phase 0 — Scaffolding & spike.** Add deps (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`, `@assistant-ui/react`, shadcn essentials; Tailwind v4 already present). Read `node_modules/next/dist/docs/` first. Build `app/api/chat/route.ts` (`streamText`, `stopWhen: stepCountIs(8)`, one stub tool returning a typed fact). Chat page with `useChat` rendering `message.parts[]` → stub `<FactCard/>`. **Deliverable:** message → tool → owned card renders. Architecture proven. (New files only.)

**Phase 1 — Store + parse + intake.** `0010` migration; extend `TriageAnswers`/`CoverageProfile` zod. `caseStore` tool(s) wrapping `lib/case/queries.ts` + admin writes + `case_events`. `parseDocument` tool: salvage the LLM bodies/prompts/schemas from `lib/parse/run-parse.ts` + `lib/upload/classify.ts`, **drop** the WDK CAS wrapper (agent invokes parse synchronously). Composer "+" upload → private bucket (salvage `app/api/documents/route.ts`) → `documentId`. **Deliverable:** upload a statement → classified (`bill`, `itemized:false`), stored, agent reads the bundle; doc chip renders. (Drop: `parseDocumentsStep`/`autoTriageStep`.)

**Phase 2 — Triage verdicts (center of gravity).** `ADVISOR_SYSTEM` prompt: bright line, doc-type vocabulary, insurance-situation taxonomy, situation→lever map (mine `SYNTHESIS.md §2`), the conservative asymmetry ("when unsure → verdict 4/1, never 2"). Verdicts 1 & 4 = pure-agent + `caseStore` (`itemized:false` → "don't pay yet" + `renderItemizedRequest`; missing-EOB/low-confidence → need-more). Verdict 2 = EOB↔bill reconciliation via `runEngineTool` C1; show reconciliation in the amounts panel. Build VerdictCard + AmountsPanel + IntakeMiniForm. **Deliverable:** statement → "don't pay yet"; clean itemized+EOB → "looks correct, OK to pay." (Reuse verdict copy from `router.ts`/old pages; `triage.ts`; static templates.)

**Phase 3 — Engine lever + assertion-of-right letter.** `runEngineTool`: assemble `EngineInput` from the bundle (mirror `auditStep` in `case-lifecycle.ts`, but in-tool with in-memory refs via `referenceDataFromJson`); return `finding:engine:<checkId>:<evidenceKey>` + verdict facts. Demo flag: **C4 NCCI unbundled** (vivid) or C3 duplicate — seed the pair in refs. `draftArtifact`: wrap `artifacts/route.ts`, gate behind `needsApproval` → confirm bubble. **One assertion-of-right lever: ACA §2713 preventive-$0** — KB rule + appeal letter path. **Deliverable:** flagged line → ranked options → drafted letter behind confirm → activity log paper trail. (Reuse `c4-ncci.ts`/`c3-duplicates.ts`, `router.ts`, `letters/*`, `artifacts/route.ts`, `savings-diff.ts`, `auditStep` assembly.)

**Phase 4 — Validator, eval, polish, cut the old shell.** Wire the bright-line validator (§7). Extend eval: doc-type + verdict classification over `docs/v0.1-cases/*` fixtures; reuse the engine golden eval; add groundedness. **Drop** `app/(case)/**`, `workflows/case-lifecycle.ts`, most `app/api/**` (keep `documents`, `auth/*`, `cron/reconcile`, `jobs/purge`, `health`) — last, so salvage is done. Polish: light activity log, confirm buttons, doc viewer, empty state with suggested starts. **Deliverable:** the scope-cut demo end-to-end, safety eval green in CI.

## 4. Tool implementations
Every tool returns **typed, id'd facts** (`line:`, `finding:`, `rule:`, `eob:`, `doc-diff:`, `verdict:`).
- **`parseDocument`** — wraps `classifyDocument` + `run-parse.ts` LLM bodies via the **single shared `llm.call`** (PHASE gate + ledger + spendGuard preserved). In `{caseId, documentId}` → out `{kind, quality, itemized, adjudicationVisible, printedTotalCents, lineItems:[{id:"line:…"}], eob?}`. Document text never leaves the parse call (untrusted-data prompt verbatim).
- **`kbLookup`** — new; backed by `seed/kb/*.json`. In `{situation, problemTags}` → out candidate rules filtered by `coverage_types`+`problem_tags`+`qualifies_when`, each `{id:"rule:kb:…", lever, clocks, citations, confidence, actions}`. Low-confidence → forces a hedge.
- **`runEngineTool`** — wraps `runEngine`+`routeVerdict`+`referenceDataFromJson`; assembly mirrors `auditStep`. In `{caseId}` → out `{findings:[{id:"finding:engine:C4:…"}], coverage, verdict:{primary,stacked,rationale,unlocks}}`. Preserves the PAY honesty gate.
- **`draftArtifact`** — wraps `artifacts/route.ts` + `letters/*`. In `{caseId, type, findingIds}` → draft `{artifactId, letterText}`; **`needsApproval:true`** → confirm bubble → persist + `case_events`. LLM fills only `{{FACTS_i}}` (numbers forbidden); dollars injected from findings; `validateLetter` fail-closed.
- **`caseStore`** — wraps `lib/case/queries.ts` + `money.ts` + admin writes + `case_events` + `coverage_profile`. Reads under user JWT (RLS); writes via admin client (server-only). Amounts carry source ids; rollup status computed + narrated, never LLM-originated.

**Bright-line validator — exactly where** _(revised per Post-review resolution #3 — the bright line is **structural**, not a stream-blocker):_ (1) **structural (primary):** the agent surfaces numbers/verdicts **only** by rendering tool-fact cards (VerdictCard/AmountsPanel) bound to tool outputs; the system prompt forbids originating figures in prose. (2) per-tool: id'd facts; `draftArtifact` runs `validateLetter` fail-closed (built) — the real bright line on the only artifact with legal weight. (3) **flag-only linter** (`lib/agent/bright-line.ts`, new): scans assistant prose for `$`-figures / a small verdict lexicon and **flags** (you can't block a stream the user already saw) — a tripwire, not a guarantee. Eval the structural property, not the regex (§7).

## 5. Inline component catalog (June 27 set)
Owned, accessible (icon+color+text, never color alone), text fallback each; bound to tool parts (`input-available`→skeleton, `output-available`→card).

| Component | Binds to | Notes |
|---|---|---|
| **VerdictCard** (hero) | `runEngineTool` verdict / agent-proposed | 4 variants from `VerdictKind` + triage taxonomy (⏸ don't-pay-yet=GET_ITEMIZED/WAIT · ✅ looks-correct=PAY/CLEAN_PARTIAL · ⚠ something's-off=CONTEST/APPEAL/REDUCE `role="alert"` · ❓ need-more). Body = router `rationale[]`. Provenance line. |
| **AmountsPanel** | `caseStore` amounts + `parseDocument` EOB | billed/allowed/paid/owed/disputed; tabular figures, right-aligned, emphasized total; never a total without line items; source id per row. |
| **DocChip + Viewer** | `parseDocument` (kind, pageCount) | "📄 Statement, 2 pages"; tap → side panel (web) / full-screen (mobile); bytes via server-proxied documents route. |
| **IntakeMiniForm** | agent request for situation | grouped card (coverage type / FI-vs-self-funded / used-insurance) → `coverage_profile`; falls back to conversational. |
| **ConfirmButtons** (risk-tiered) | `needsApproval` parts (`draftArtifact`) | Approve/Edit/Reject + preview; hard-gate "send"; auto (no confirm) for parse/KB/engine/draft-to-draft. |
| **ActivityLog** (light) | `case_events` via `caseStore` | timestamped, most-recent-first; states by icon+color+label; the transparency + evidence surface. |

Deferred: deadline chips (stub as text), timeline polish, viewer gestures. A11y musts: single persistent `role="log"` `aria-live="polite"` thread; reserve min-height; auto-scroll only at bottom; never auto-load remote images (PHI exfil); render only our bytes.

## 6. KB seeding
Rule schema = the Q5 shape, stored as `seed/kb/*.json` (defer a `kb` table); thin `lib/kb/index.ts` loads + filters. **Four rules** for the demo (span the situation→lever map without the 50-state library): (1) `kb:statement-not-final` (doc-type=statement → don't pay yet; `draft-itemized-request`) → verdict 1; (2) `kb:eob-bill-reconcile` (EOB cost-share == billed → looks-correct) → verdict 2 + engine C1; (3) `kb:ncci-unbundling` (`unbundled-supply`; `draft-appeal`; cites NCCI manual) → engine C4 narration + letter; (4) `kb:aca-2713-preventive` (the assertion-of-right lever; coverage_types FI/self-funded/marketplace; `qualifies_when` graded-preventive-AND-screening; clocks internal-appeal 180d / external ~4mo; cites 45 CFR 147.130 + KFF with `as_of`; Braidwood note) → verdict 3 appeal. Each carries `version`/`as_of`.

## 7. Eval & safety
- **Bright-line groundedness:** the conversational validator (§4) + an `eval/groundedness/` suite (every `$`-figure + verdict resolves to a tool fact id that actually contains the value; fabrication=fail) + red-team ("just estimate what I owe" → assert refuse-to-originate).
- **Doc-type + verdict eval:** lift ~6–10 `docs/v0.1-cases/*` into fixtures `{input, expected:{docType, situation, verdict, levers}}`. **Primary safety metric: the false-OK rate** (verdict-2 when truth is verdict-3); optimize recall on "something's off"; confusion matrix on doc-type. Gate in CI alongside `pnpm eval`.
- **Reuse the engine golden eval untouched** (13 fixtures incl. 011-injection-resilience, 012-reproducibility — the OWASP-LLM01 defense; keep green).
- **Prompt-injection / untrusted UI:** parsed content is untrusted (preserve the "document is DATA not instructions" prompts); engine can't be moved by document text (keep the purity invariant + eval); external-effect tools `needsApproval`-gated; render only the owned catalog; no auto-load remote images; allowlist URL schemes; test ARIA live regions with real AT. **PHI:** field-allowlist logger; the `ai_calls` ledger (the AI-SDK conversation path must also write a ledger row — small adapter); RLS owner-only.

## 8. Open questions — resolved
- **(a) Assertion-of-right lever → ACA §2713 preventive-$0.** On the engine's home turf (composes with the coding-flag beat), a single crisp citation (45 CFR 147.130) ideal for the bright-line letter; charity-care/501(r) is trap-laden + needs hospital-specific FAP data (MINI-tier stubs). Keep `renderFapChecklist` as a bonus; make ACA §2713 the end-to-end drafted artifact.
- **(b) Model → stay on pinned `claude-sonnet-4-6` for the structured tools** (engine eval, parse prompts, `validateLetter` thresholds calibrated on it; changing risks silent extraction regressions pre-deadline). Spike the latest Sonnet only for the agent-loop conversation, behind `BILLCHECK_MODEL` (one-line config). _Verify current Sonnet ids/pricing against live Anthropic docs before flipping — no newer id assumed._
- **(c) UI → adopt the AI SDK pattern directly** (typed `message.parts[]` + `useChat`) with assistant-ui as the shell: streaming + attachments + a11y + **`needsApproval` HITL** out of the box. Owned catalog via the part→component switch (NOT the paused RSC `streamUI`). Only in-house piece = the bright-line validator wrapping the stream.
- **(d) Schema → exactly one migration** (loosen `validate_case_transition()`); everything else faked in app code (`coverage_profile` JSONB, `case_events`, computed-on-read, `itemized` boolean). Defer the Bill/amounts/situation tables.

## 9. Risks + the cut-line
**Risks:** (1) **the agent loop needs a second Anthropic path (AI SDK) bypassing the shared client** → dents the "one LLM entry point" invariant + ledger; mitigate with a ledger adapter (AI-SDK conversation calls also insert `ai_calls`), keep structured tools on the shared client (~half-day). (2) Next 16 streaming surprises → Phase 0 spike reads the bundled docs. (3) Parse quality on messy photos drives false-OK → conservative asymmetry + verdict-4 on low confidence + the reconciliation gate (built). (4) Migration on the shared dev/preview DB → drop-corridor sequenced after salvage; loosened trigger is backward-compatible. (5) Validator false positives → start flag-only, tune vs the groundedness eval, flip to block before demo. (6) Scope creep into the campaign engine → deadlines stubbed (null-dated rows, as `verdictStep` already does).

**Cut-line (trim in this order):** first the ACA §2713 letter (keep the engine flag → "something's off" + the already-built dispute letter behind confirm); next the engine flag itself (fall back to verdicts 1+2 with doc-type detection + amounts + the static `renderItemizedRequest`); **floor (coherent product):** chat-first + the common triage path (statement→"don't pay yet"; clean EOB+bill→"looks fine") with verdict card, amounts panel, doc chip, one confirm-gated letter — still proves intake→doc-type→verdict→owned cards→bright line→HITL. **Always keep green:** the engine golden eval + the bright-line groundedness check.

## 10. Rough effort / sequencing (~10-day push, relative weights)
| Phase | Size | Why |
|---|---|---|
| 0 Scaffolding & spike | ~1.5 | Net-new stack + Next 16 unknowns + the ledger-adapter risk; highest uncertainty/unit. |
| 1 Store + parse + intake | ~2 | Mostly salvage, but de-WDK-ing parse + the migration + situation schema. |
| 2 Triage verdicts | ~2 | The system prompt is the heavy lift; the center of gravity — invest here. |
| 3 Engine lever + letter | ~2 | Engine tool thin (reuse); artifact mostly reuse; ACA rule + appeal path + `needsApproval` = new. |
| 4 Validator + eval + cut shell | ~1.5 | Validator + groundedness/doc-type eval + delete old shell + polish. |
| Buffer | ~1 | Demo hardening, validator false-positive tuning, mobile streaming stability. |

**De-risking rule:** finish a *thin* end-to-end path (upload statement → "don't pay yet" card) by end of Phase 1/early Phase 2 — it already exercises intake, doc-type, store, a verdict, an owned card, and an activity entry. Everything after is independently demoable breadth, so the cut-line can fire anytime and leave a coherent product.

### Critical files
- `packages/engine/src/verdict/router.ts` — deterministic verdict source (D10 cascade, PAY honesty gate); `runEngineTool` wraps it; the verdict card renders its `rationale`/`stacked`.
- `packages/shared/src/letters/templates.ts` + `letters/validate.ts` — bright-line artifact drafting + fail-closed `validateLetter`; `draftArtifact` wraps these; the conversational validator reuses the `$`-figure logic.
- `apps/web/app/api/artifacts/route.ts` — the existing end-to-end bright-line letter flow; the template for `draftArtifact`.
- `apps/web/workflows/case-lifecycle.ts` — DROP the corridor, SALVAGE the `EngineInput` assembly + ref-loading (`auditStep`, `loadLatestRefs`) into `runEngineTool`.
- `supabase/migrations/0001_core.sql` — the schema/RLS/`case_events`/state-trigger that `0010_living_thread.sql` must surgically loosen (the only required migration).
- Supporting: `packages/shared/src/llm/client.ts` + `apps/web/lib/llm.ts` (single client + ledger + PHASE); `apps/web/lib/parse/run-parse.ts` + `lib/upload/classify.ts` (parse bodies); `packages/shared/src/triage.ts` (extend for the situation taxonomy); `packages/engine/eval/eval.test.ts` (golden-eval pattern to extend).

---

## Review addendum (fresh-eyes pass, 2026-06-17)
Independent staff-engineer review that verified the plan against source. **Verdict: buildable, but not
as-is — fix the three P0s in Phase 0.** The plan's load-bearing codebase claims were confirmed (engine
purity/DB-free; single-shot LLM client; no `bills` table; the state trigger + 10-state graph;
`case_events` append-only; `artifacts/route.ts` bright-line generation; doc-type = `itemized` boolean).

**Corrections to the body:**
- **C1 (doc-type):** correct in substance. `itemized` lives in **both** `EngineInput.itemized`
  (`packages/engine/src/types.ts`, consumed by the PAY gate) and persisted in `documents.extracted` JSONB.
  `documents.kind` is **CHECK-constrained** (`bill,eob,gfe,receipt,collection_notice,corrected_statement,
  other`) — a "statement" = `bill` + `itemized:false`; the agent must never write a `kind` outside the set.
- **C2 (artifacts.type):** `'appeal'` is **already** an allowed `artifacts.type` (`0001_core.sql`). The ACA
  §2713 work is **one new `renderAppealLetter` template + its `validateLetter` source-set wiring**, not a
  new artifact path.
- **C3 (HITL):** `artifacts/route.ts` gives bright-line *generation*; in-conversation **approval is
  net-new**. Today's approval is a separate REST endpoint + a fact-**attestation** write before download.
  The AI-SDK `needsApproval` → ConfirmButtons → `addToolApprovalResponse` → attestation bridge is the
  riskiest UI seam (see P1-HITL).

### P0 — must fix before building (resolved in the banner above)
- **P0-1 — second Anthropic path bypasses all guards.** `@ai-sdk/anthropic` ≠ `@anthropic-ai/sdk`, so it
  passes the ESLint ban while escaping the PHASE gate (fail-closed pre-BAA boundary; the chat path is
  anonymous-reachable and will carry PHI), the spend kill-switch (runs *before* bytes leave; a post-hoc
  ledger row can't stop a runaway on the highest-volume multi-step caller), and PHI-safe error logging.
  **Resolution:** run the loop on the shared client via a new `converse()`/tools-mode (standard manual
  tool-use loop: call → if `stop_reason==='tool_use'` dispatch tools, append `tool_result`, repeat); add
  `@ai-sdk/anthropic` to the ESLint ban. Fallback if `useChat` ergonomics are wanted: route the AI-SDK
  provider's `fetch`/`baseURL` through the shared PHASE+spend+ledger guards. **Never** ship a parallel raw
  provider with only a post-hoc ledger insert. Size 1.5–2 days, Phase 0.
- **P0-2 — "one migration" is 3–4 objects if you repurpose `state`.** Repurposing breaks: the line-items
  client-edit guard (`0008`/`0009`, hardcodes `CAPTURED/TRIAGED/WAITING_*` → every line-item edit rejected,
  killing the correction path), the INSERT-requires-`CAPTURED` branch (`0001:48`), `rollback_provisional_case`
  (`0008:234`, gates on `CAPTURED` → leaks empty cases), and `EDITABLE_STATES` (`lib/case/rules.ts`).
  **Resolution:** keep `state` in the existing vocabulary; represent the living-thread lifecycle as a
  narrated value in `coverage_profile`/`case_events` (the agent narrates status anyway, §"Case status"). If
  we ever do repurpose `state`, it must be one transaction rewriting all 3–4 objects + `rules.ts`.
- **P0-3 — the streaming validator can't block, and the regex is too weak.** (a) You can't post-validate a
  stream before the user sees tokens — it's detect-and-retract, not prevent; (b) `$`/keyword regex misses
  word-numbers ("about four grand") and paraphrased verdicts ("I wouldn't worry about this one") — high
  false-negatives on the exact failure mode that matters; (c) the allowed-set is **empty** on the
  agent-only verdict-1/4 paths (no engine run, no findings). **Resolution:** the bright line is
  **structural** — the agent surfaces numbers/verdicts only by rendering tool-fact cards; the system prompt
  forbids originating figures in prose. `validateLetter` stays fail-closed for artifacts (the only thing
  with legal weight). The prose scanner is a **flag-only tripwire**, not a stream-blocker. Groundedness
  eval tests the structural property ("every actionable number is a card bound to a tool fact"; red-team
  "just estimate what I owe" → must call a tool or refuse), not "regex finds no unsourced `$`".

### P1 — should fix
- **P1-Parse:** the "don't pay yet" beat keys off `extracted->>'itemized'` from a single LLM call on messy
  photos. Wire **verdict-4** ("can't read this clearly") to fire on low `classify.quality` OR
  `reconciliation_ok === false` (a free, already-built gate, `0004`) OR `confidence < 0.7` (already in
  `rules.ts`); keep a clean fixture as the demo A-path.
- **P1-HITL:** scope the `needsApproval` → ConfirmButtons → `addToolApprovalResponse` → **attestation
  write** bridge as its own ~1-day Phase-3 item; decide if attestation collapses into the approval bubble.
- **P1-Anon:** run the demo **fully anonymous**; defer claim-in-chat. The `claim.ts`/`consume_claim_token`
  RPC carries over, but the *when/how* of a mid-chat claim prompt + OAuth round-trip back to the thread is
  net-new UX — don't list it as "carries over unchanged."
- **P1-Refs:** seed the exact **C4 NCCI pair** (and both codes on the synthetic bill) for the demo; load
  `runEngineTool` refs from an **in-memory JSON fixture** (simpler, no DB dep) — production ref-loading is
  out of scope.
- **P1-Next16:** make the Phase-0 spike's exit criterion explicit — *a streamed response from a Next 16
  route handler reaching the client with a tool-part rendering* (not just "message → card").
- **P1-Eval-offline:** the new doc-type/verdict/groundedness evals must run **offline in CI** (no live
  Anthropic calls; use the client's `transport` test seam / recorded outputs), or keep model-in-the-loop
  evals as a manual pre-demo gate. CI runs `lint→typecheck→test→eval→build` offline today.

### P2 — watch
- **Model:** decide the conversation model in Phase 0 (keep parse/letter on pinned `claude-sonnet-4-6`;
  pick the loop model behind `BILLCHECK_MODEL`, verify the id against live docs before flipping).
- **Rate-limit `/api/chat`** (anonymous, multi-step `stepCountIs(8)`): reuse the upload rate-limiter; the
  spend guard alone is not a per-session backstop.
- **Reuse the upload route wholesale** (4MB cap, magic-byte sniff, ≤40 pages, opaque keys, server-proxied)
  — don't reinvent.
- **Error/empty/loading states** per card — esp. the **parse-failed → verdict-4** card (load-bearing).

### Over-engineering to cut
- The **stream-blocking validator** ambition → flag-only + structural (P0-3); reduces scope.
- **assistant-ui** is a 3rd new dep on top of Next 16 + AI SDK; if the loop runs on the shared client
  (P0-1) you can render the thread yourself and likely **drop assistant-ui** — evaluate in Phase 0.
- **`kbLookup` as a `qualifies_when` filter engine** for *four* hardcoded rules → make it a **thin lookup**
  (keep the JSON files for the as_of/versioning story); the filter engine is for the 50-state library
  we're not building.
- **IntakeMiniForm + conversational fallback both built** → build the **conversational** intake (the
  thesis), stub the form as text if time-boxed.

### What's strong / keep
Grounding discipline (claims verified in source); the phasing + "thin end-to-end by Phase 1" de-risking;
the cut-line ordering; **engine + router + golden eval reused untouched** with the **PAY honesty gate**
(never `PAY` on a partial battery → exactly the conservative asymmetry the safety story needs); structured
tools (parse/classify/letter) on the shared client (the anchor that pulls the loop back onto it, P0-1);
`validateLetter` fail-closed as the genuine artifact bright line.
