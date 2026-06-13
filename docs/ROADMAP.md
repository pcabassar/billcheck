# billcheck — Roadmap & deferred work

Living doc. What we've consciously deferred, why, and what's next. Status doc
for live state is `HANDOFF.md`; the plan of record is
`docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md`.

## Near-term — pre-launch blockers

These gate the public, non-synthetic funnel (Phase B):

- **Phase B flip preconditions** (AGENTS.md): Supabase Team + HIPAA add-on,
  Vercel HIPAA add-on, Anthropic BAA signed. Production stays `PHASE=A` until
  all three. (dev/preview run `PHASE=B` on synthetic data — access-restricted.)
- **Stripe test keys** → wire PWYW live (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`). Code is built and env-guarded; inert until set.
- **Review round 2** — full multi-agent review of Phase B.5+C once the
  claude.ai monthly spend limit is raised (round 1's verification was
  truncated by it). See `docs/reviews/2026-06-12-review-round-1.md`.
- **pg_cron registration** for `/api/cron/reconcile` and `/api/jobs/purge`
  (needs the deployed URL + CRON_SECRET header) — after production promote.

## Review the agent/workflow flows against Vercel Workflow features

The case lifecycle uses Vercel Workflow DevKit correctly today (audited
2026-06-13: directives, `start()` placement, FatalError/retry semantics,
serialization all current). But we're using a thin slice of WDK and should
revisit whether richer features fit:

- **Hooks / webhooks instead of polling.** The S5 EOB-wait and the
  letter-response wait are currently a `deadlines` row + cron + client
  polling. WDK `createHook()`/`createWebhook()` could model these as true
  durable pauses (workflow suspends until the EOB upload / response event),
  removing the poller and the reconcile-sweep dependency for these paths.
- **`sleep()` for timed reminders.** The +21d EOB reminder and +30d
  response-expected windows are deadline rows today; WDK `sleep()` could
  drive them natively inside a long-lived workflow.
- **Step-level LLM idempotency.** Coarse steps mean a retry after a mid-step
  LLM success re-calls the model (cost, not correctness; bounded by the parse
  CAS claim + attempt cap). WDK recommends the stable `stepId` as an
  idempotency key for external side effects — worth applying to the Anthropic
  calls, or splitting the LLM call into its own finer step.
- **Namespaced streaming** for live progress (replace the confirm-page
  poller with a streamed run).
- **`DurableAgent` — intentionally NOT used.** billcheck has no autonomous
  agents by design (D3): verdicts are deterministic (engine + router), and
  LLM calls are single constrained structured-output calls. Revisit only if a
  genuinely agentic feature appears (e.g. a guided multi-turn appeal builder).
- **AI SDK / AI Gateway — intentionally NOT used.** We call `@anthropic-ai/sdk`
  directly through one shared client so document bytes go straight to
  Anthropic inline (BAA boundary, D3) and the `ai_calls` ledger has exact
  control over what's recorded. Revisit only if the BAA/observability
  tradeoffs change.

## Carried from review round 1 (punch list)

Full list: `docs/reviews/2026-06-12-review-round-1.md`. Open items:

- **F22 anonymous sign-in rate limiting** — pairs with the spend alarm
  (built) to fully close the anonymous-abuse vector.
- **F26/F27 deletion design** — right-to-deletion UX path; storage-object
  cleanup verified end-to-end (the purge job, U17, now covers the time-based
  case).
- **F21 real PDF page count at parse time** — current ceilings are the 4MB
  upload cap + Anthropic's own page limit; a true count needs a PDF parser.
- **F37–F41 typed DB layer** — generate Supabase `Database` types; typed
  contracts for the `extracted` / `coverage_map` JSON columns; remove
  `as unknown as T` laundering.
- **F53–F55 route tests** — letter fail-closed branches, edit-lock 409s,
  rate-limiter boundary (orchestration logic is now extracted + unit-tested
  for purge/claim; extend the pattern).
- **F44/F48/F63** — dead exports, duplicate `formatCents`, route-plumbing dedup.
- **F74** — PHASE-gate semantics for prompt-only calls carrying
  document-derived text (letter fill passes engine-generated finding titles,
  not raw document text — but the boundary deserves an explicit decision).
- **F79** — `maxDuration` on workflow steps; parallel parses for
  multi-document cases.

## V1 — beyond the V0 plan

- **Engine checks C7/C11/C12** — timely-filing, records-based (services your
  records don't support), upcoding patterns. C11/C12 are LLM-judgment checks
  that run OUTSIDE the engine and feed in as typed inputs.
- **Real reference data** — replace MINI seeds with full quarterly CMS
  NCCI/MUE/PFS sets + a real FAP corpus (manual download → refresh-reference).
- **Payer EOB auto-sync** (CMS Patient Access APIs) — reaches ~35–45% of
  insured; treat as v2 (self-funded employer plans excluded).
- **Voice agent for itemized-bill requests** — collapses the worst latency in
  the workflow (Pedro has piloted voice agents before).
- **The "wall"** — verified-bills-only public showcase (mission + PWYW
  prosocial framing). Later version.
- **B2B pro tier** for billing advocates.
- **Wellthy benchmark** — retrospective hit-rate vs. their Billing
  Specialists on ~20 redacted resolved cases (needs org blessing via Alex).

## Pedro-led / external

- AMA dev-program signup (CPT descriptor licensing).
- Domain + trademark check on "billcheck".
- Founder conversations (Avelis, Goodbill).
- Entity formation at the first external trigger (Wellthy contract / Stripe
  live / AMA commercial license) — see the memory note.
