---
title: "feat: Bill Check V0 — consumer medical-bill audit app"
type: feat
status: active
date: 2026-06-12
deepened: 2026-06-12
origin: medical-bill-app-flow-wireframes-2026-06-12.html (product spec v0.2) + medical-bill-app-architecture-decisions-2026-06-12.md (ratified D1–D10)
---

# feat: Bill Check V0 — consumer medical-bill audit app

**Target repo:** `billcheck` — new, to be created at `/Users/pedro/claude-workspace/billcheck`. All file paths below are relative to that repo root. This plan lives in the gtm-pedro workspace; copy it to `docs/plans/` once the repo exists.

## Summary

Build V0 as a greenfield Next.js 16 + Supabase monorepo with the audit engine as a standalone package: a user photographs a bill, gets it parsed, decoded, and triaged, the deterministic check battery runs with an honest coverage map, the D10 router issues a verdict with evidence, and the user downloads generated letters — with a corrected-statement re-upload closing the loop to verified savings and the PWYW ask. Three phases: foundation, a hackathon-demoable vertical slice (June 27), then full V0.

---

## Problem Frame

Strategy, product spec (22 wireframes, D1–D15, C1–C13), and architecture (D1–D10, ratified 2026-06-12) are settled in the origin documents. What remained unplanned was the V0 execution cut — and flow analysis showed the provisional cut was coherent about *knowing* (upload → audit → verdict) but incoherent about *resolving* (PWYW had no trigger path; fight verdicts dead-ended at a PDF; triage asked questions V0 couldn't honor). This plan executes the architecture and closes those gaps with letters, copy, and one re-upload flow.

---

## Assumptions

*Authored with Pedro's blanket go-ahead rather than per-item confirmation. These are agent bets — review before/while implementation proceeds; all are cheap to reverse.*

- Repo named `billcheck` at `claude-workspace/billcheck`; working code name carries until naming decision.
- V0 excludes the full response/escalation loop (S15) but includes **resolution-lite**: my-bills state actions + corrected-statement re-upload → verified savings → PWYW. This resolves the scope contradiction found in flow analysis (PWYW otherwise untriggerable).
- PWYW ships in **Stripe test mode** (live Stripe = LLC trigger per entity plan).
- The hackathon slice is a thin vertical (upload → parse → decode → engine-lite → letter) through one WDK workflow — not full V0.
- **DECIDED (Pedro, Proof review): U16 (manual EOB upload + C1/C2/C6) is core V0** — built post-June-27, before V0 ships. Flow analysis's recommendation accepted: without it V0 would be structurally a self-pay/itemized product while insured users are the majority.
- APPEAL in V0 = routing + deadline warning + handoff links (Counterforce, Fight Health Insurance), **not** letter generation (only signal is a triage self-report; generating from that alone is irresponsible).
- FAP reference data seeded for ~10 demo hospitals only; honest degraded copy otherwise.
- V0 sends exactly one scheduled email (the S5 "don't pay yet" +21-day reminder) via a single pg_cron job — no broader notification system.

---

## Requirements

- R1. A user can upload/photograph a bill and receive an honest verdict with cited evidence; non-bills and near-misses get a graceful reject with guidance.
- R2. Deterministic checks are reproducible and versioned: every finding records check version, reference-table version, evidence pointers, confidence tier, and $ impact.
- R3. Verdicts follow the D10 v0.2 cascade with honest degradation: a coverage map drives every claim; PAY is gated behind minimum evidence coverage; code-less bills get "get the itemized bill" as a first-class verdict, not a degraded PAY.
- R4. Letters (dispute, FDCPA validation, itemized request, FAP application) are generated, user-approved, and downloadable free; portal-guided delivery included; every download ends with what-happens-next closure copy.
- R5. Cases persist with explicit states and never dead-end: my-bills rows carry state-conditional actions (add document / I sent it / tell us what happened / close).
- R6. The PWYW ask fires on any user-confirmed positive outcome (Pedro, Proof review): document-verified savings (corrected-statement diff) get the full anchored ask ("we saved you $X", suggested ≈10%); self-reported success (`RESOLVED_SELF_REPORTED`) gets an unanchored pay-what-feels-fair ask that never asserts a dollar figure, plus an upload-to-verify nudge that upgrades to the anchored ask. The app never *claims* verified savings without the document diff.
- R7. The eval harness runs golden-case fixtures against the engine; engine changes that regress fixtures fail CI.
- R8. PHI-grade rules from day one: RLS on all tables, private buckets with server-proxied document reads (or ≤120s signed URLs, never persisted), no PHI in logs/URLs/workflow payloads, anonymous-session documents auto-purged, column-level care on sensitive fields. Synthetic/own data only in this phase (arch D4). **Each R8 property carries at least one adversarial/negative test gating CI** (cross-user claim attempt, expired/foreign document access, PHI-in-error-logs, purge-touches-claimed-data) — happy-path RLS tests alone do not satisfy R8.
- R9. A demoable vertical slice exists by **June 27, 2026** on Vercel Workflows + AI SDK 6.
- R10. All business logic sits behind typed API boundaries (mobile-ready, arch D9); the audit engine is a standalone package with no UI/auth imports (arch D2).

---

## Scope Boundaries

- No Epic/clinical connect (C11, C12), no payer APIs, no Flexpa — V1+ (arch D6).
- No paid delivery (fax/mail vendors), no voice agents, no wall UI (data flags only), no coordinator dashboard, no Spanish, no mobile apps.
- No full case dashboard with deadline-clock UI (S14 full), no response classification (D12/S15), no escalation ladder, no collections *track* beyond the FDCPA validation letter.
- C7 (NSA violations) explicitly excluded from V0 — needs EOB/network data; listed on the coverage map as not-yet-available, never silently absent.
- No HIPAA paid tier yet (arch D4 Phase A); no AMA CPT descriptors dependency (decode works from document text + code numbers).
- No model routing — single Sonnet config var (arch D3).

### Deferred to Follow-Up Work

- Wellthy retrospective benchmark onboarding (seeds eval fixtures) — separate effort after engine v0 exists.
- AMA Developer Program signup — Pedro-led session, off critical path.
- Plan doc migration into repo `docs/plans/` at scaffold time (U1).

---

## Tier Map (explicit and movable — tier calls are Pedro's)

| Tier | Contents |
|---|---|
| **June 27 demo slice** | U1–U9 (with U2/U3 demo-gating halves only); public URL from day 1, AI actions behind login + access gate |
| **V0 core** | U1–U15 + U17/U18 post-demo hardening: upload → parse → decode/attest → triage → deterministic battery (C3/C4/C5/C8/C9/C10/C13) → D10 verdicts → letters (dispute, FDCPA-with-notice, itemized request, FAP) → download + portal-guided delivery → resolution-lite → verified savings → PWYW (test mode) → my-bills |
| **V0 core (promoted)** | U16: manual EOB upload + C1/C2/C6 — promoted from stretch per Pedro (Proof review); built post-demo, before V0 ships |
| **V1 (deferred)** | Epic/clinical connect (C11/C12), payer APIs, paid fax/mail send, voice agents, response loop (S15) + escalation ladder, full dashboard deadline clocks, the wall, Spanish, mobile apps, C7 (NSA checks) |

To move an item between tiers, say so — the unit structure supports moves without re-architecture.

---

## Context & Research

### Origin documents (authoritative)

- Product spec v0.2: `medical-bill-app-flow-wireframes-2026-06-12.html` (workspace `working/`) — stages, D1–D15, C1–C13, 22 screens with per-screen inputs/process/outputs.
- Architecture: `medical-bill-app-architecture-decisions-2026-06-12.md` — D1–D10 ratified; includes user model, cost phases, AMA verdict.
- Competitive brief: `medical-bill-dispute-competitive-brief-2026-06-11.md`.

### Research already performed (live sources, 2026-06-12)

- Platform research (4 agents): Anthropic (Sonnet 4.6 $3/$15, structured outputs GA, citations, prompt caching, Files API/Managed Agents not BAA-eligible), Vercel (WDK GA — unlimited sleep; Queues beta; HIPAA add-on $350/mo Pro; AI SDK 6), Supabase (Team+HIPAA $949/mo; pgmq; pg_cron 8-concurrent/10-min limits; Edge Functions 400s), AMA dev program flow.
- Flow analysis of the V0 cut (ce-spec-flow-analyzer, 21 findings): minimum-closure set integrated into units below; key blockers — PWYW trigger gap, post-download dead end, PAY false confidence, collections void, C3 facility/professional false-positives.
- Greenfield: no repo or institutional `docs/solutions/` to scan; no local patterns exist (external research stands in).

---

## Key Technical Decisions

All inherited from the ratified architecture sheet (see origin) — restated here only where the plan refines them:

- **C3 duplicate detection runs within a single bill document only**; cross-document same-code/same-date matches are suppressed with a facility-vs-professional explainer, and paired bills group under one case. (Flow finding #15 — protects the flagship deterministic check from poisoning legitimate splits.)
- **Parse-time dedupe:** provider + account # + DOS matched against the user's existing cases → "continue existing case (new statement version)" vs. "different bill." Statement versions are how corrected statements arrive (R6).
- **Coverage map is the rendering source of truth** for S10/S11 check copy: ran / skipped-no-data / not-yet-available. No hardcoded "13 ways" strings.
- **Verdict honesty gates:** PAY requires itemized bill present + C3/C4/C5/C10 all ran + **zero actionable findings** (clarified per review — "ran" alone never yields PAY); below coverage threshold the verdict is "no issues found in the N checks we could run" with unlock guidance. Code-less bills route to GET_ITEMIZED as primary verdict with the S9-lite letter, never PAY.
- **Case states V0 actually writes** (subset of arch D1 enum): CAPTURED, TRIAGED, AUDITED, VERDICT, WAITING_ADJUDICATION, WAITING_ITEMIZED, SENT_BY_USER, RESOLVED_SELF_REPORTED, RESOLVED_VERIFIED, CLOSED_BY_USER. GATHERING/EXECUTING/AWAITING_RESPONSE/ESCALATED reserved for V1 — documented in schema comments so the build doesn't invent ad-hoc states.
- **Workflow payloads carry case IDs only** (arch D7); WDK orchestrates, Postgres owns truth, daily pg_cron sweep reconciles.
- **AI call ledger (`ai_calls`):** every model call is recorded first-party — a single LLM client wrapper in `packages/shared` is the only path to the Anthropic API, and it writes the ledger row (purpose, model, prompt version, input refs, raw + validated output, tokens, latency, error). Rationale: LLM observability is standard practice, but the standard implementations (console logs, OTel tracing to third-party vendors) violate the no-PHI-in-logs rule — so the ledger lives in RLS-protected Postgres under the same purge lifecycle as case data. Side benefits: measured cost-per-audit (PWYW unit economics), prompt-version regression analysis, and the intake funnel for real-world eval fixtures (review A5).

---

## Open Questions

### Resolved During Planning

- PWYW trigger in V0: corrected-statement re-upload diff (was a scope contradiction).
- Collections answer handling: minimal VALIDATE (FDCPA letter + urgent copy) pulled into V0 — it's a letter, and the 30-day statutory window makes silence harmful.
- Attestation without C11: "didn't happen" lines add a records-request paragraph to letters (question, not accusation) and are stored for V1.
- S5 reminder promise: one pg_cron email at +21d; copy never promises more than the system sends.

### Deferred to Implementation

- Exact Sonnet prompt designs and extraction schema field lists — tune against fixtures (U8/U15).
- PDF rendering approach (HTML-to-PDF route vs. library) — pick at U9 when artifact templates exist.
- Supabase anonymous-auth conversion specifics for session→account claim — follow current Supabase docs at U3.
- WDK state-retention-during-sleep written confirmation from Vercel (arch D7 action item) — matters for V1 clocks, not V0; pursue in parallel.

### Deferred to Implementation (added per doc review)

- DECIDED (Proof review 2026-06-12): anonymous-purge window N = **30 days** (safely past the +21-day S5 reminder, so returning day-21 users never find their case purged).
- Source of the user's legal name on letters (typed free text at approval; the A4 fact-attestation block covers its accuracy) — confirm UX placement at U9.

### Deferred to Pedro (tier calls, non-blocking)

- DECIDED (Proof review 2026-06-12): U16 promoted into core V0 (post-June-27, before V0 ships); S5's reminder copy may promise EOB re-entry.
- DECIDED (Proof review 2026-06-12): name = **billcheck**. Ship the billcheck.vercel.app landing page early (U1) — satisfies the AMA dev-program URL field. Domain/trademark check still to run before launch.
- Stripe live-mode switchover: who owns it and its preconditions (LLC formed, BAA stack on)? Currently "config + entity decision" with no named owner.

---

## Output Structure

    billcheck/
    ├── AGENTS.md                      # build conventions for agentic implementation
    ├── docs/plans/                    # this plan moves here at U1
    ├── package.json / pnpm-workspace.yaml / turbo.json
    ├── packages/
    │   ├── shared/                    # zod schemas + TS types (ParsedBill, Finding, Verdict, CoverageMap…)
    │   └── engine/                    # audit engine: checks/, verdict/, reference/, eval/
    │       ├── src/checks/            # c3-duplicates.ts, c4-ncci.ts, c5-mue.ts, c8-gfe.ts, c9-fap.ts, c10-benchmark.ts, c13-payments.ts
    │       ├── src/verdict/router.ts  # D10 v0.2 cascade + coverage gating
    │       └── eval/fixtures/         # golden cases (synthetic)
    ├── apps/web/                      # Next.js 16 App Router
    │   ├── app/(public)/              # S1 landing, S17-lite wall preview placeholder
    │   ├── app/(case)/                # S2…S13, S16 screens
    │   ├── app/api/                   # typed route handlers (mobile-ready boundary)
    │   └── workflows/                 # WDK case-lifecycle workflow
    └── supabase/
        ├── migrations/
        └── seed/                      # reference-table loaders (NCCI, MUE, Medicare rates, FAP demo set)

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

Data model (key tables → key columns):

- `cases` — user_id, state, coverage_profile (insured_type/self_pay), primary_verdict, stacked_tracks[], consent_status, external_ref
- `case_events` — case_id, type, payload_jsonb, at (append-only)
- `documents` — case_id, kind (bill|eob|gfe|receipt|collection_notice|corrected_statement|other), storage_path (opaque UUID key), filename, parse_status, version_group, version_number, content_hash, redaction_status
- `engine_runs` — case_id, check_versions, ref_version_map, status, completed_at (findings append-only per run; case points at current completed run)
- `line_items` — document_id, code, code_system, description_raw, description_plain, units, amount (integer cents), dos, confidence
- `attestations` — line_item_id, status (remember|not_sure|didnt_happen)
- `findings` — case_id, check_id, check_version, ref_version, confidence_tier, amount_impact, evidence_jsonb
- `verdicts` — case_id, primary, stacked[], coverage_map_jsonb, router_version
- `artifacts` — case_id, type (dispute|validation|itemized_request|fap_app), content_ref, approved_at, delivered_via
- `deadlines` — case_id, type, due_at (nullable), source (V0 writes: ppdr_file_by, response_expected_by, appeal_window — null-dated until user supplies denial date, review G2)
- `payments` — case_id, kind (pwyw), stripe_ref, amount
- `ai_calls` — case_id (nullable), document_id/engine_run_id refs, purpose (classify|parse|decode|letter|judgment), model_id, prompt_version, input refs (document version — never duplicated bytes), raw_completion, validated_output, tokens_in/out, latency_ms, stop_reason, error_code (Pedro's request 2026-06-12: every AI call's I/O captured first-party — in RLS-protected Postgres, never in logs or third-party tracing)
- reference: `ncci_ptp`, `mue`, `medicare_rates`, `fap_policies`, `carc_rarc` (stretch)

Flow: S2 upload → classify (D1) → [reject screen | case create/attach (dedupe)] → WDK workflow parse step (sole orchestrator, review F1+A7) → S3 confirm → S3b decode+attest → S4 triage (D4/D5/D6/D14/D15) → engine run (coverage map) → D10 router → verdict screens → artifacts → S13 download + closure panel → my-bills state actions → corrected-statement re-upload → savings diff → S16 PWYW. One WDK workflow per case orchestrates parse→audit→verdict; pg_cron (via pg_net → internal routes): daily reconciliation sweep + S5 reminder job + anonymous-purge job.

---

## Implementation Units

### Phase A — Foundation

### U1. Repo scaffold, monorepo, CI

**Goal:** Working empty product: monorepo builds, deploys to Vercel, Supabase project linked, AGENTS.md sets build conventions.
**Requirements:** R9, R10 · **Dependencies:** none
**Files:** Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/web/*` (create-next-app, App Router, TS), `packages/engine/package.json`, `packages/shared/package.json`, `AGENTS.md`, `.github/workflows/ci.yml`, `docs/plans/` (move this plan in)
**Approach:** pnpm workspaces + turbo; engine and shared are pure TS packages (no Next imports — enforce via lint rule); CI = typecheck + test + engine eval. Model ID + all secrets via env (arch D3). Structured logger with a field allowlist from day one + lint rule banning `console.*` in workers/jobs — this is the enforcement mechanism for the no-PHI-in-logs rule (deepening: security #4). Per doc review: provision a transactional email provider (e.g., Resend) configured as Supabase custom SMTP — auth mail, claim tokens, and the S5 reminder all depend on it and Supabase built-in SMTP is dev-only (review F3); suppress Vercel platform log capture for this project + CI check that upload/parse response bodies carry no base64/binary document content (review S2); AGENTS.md documents the PHASE A→B flip preconditions — Supabase Team+HIPAA active, Vercel HIPAA add-on active, Anthropic BAA signed (review S3).
**Test scenarios:** Test expectation: none — scaffolding; CI green is the test.
**Verification:** `pnpm build` passes; deployed hello page on Vercel; engine package importable from web.

### U2. Schema v1, RLS, storage, purge

**Goal:** All V0 tables, policies, buckets, and the documented state enum exist.
**Requirements:** R2, R5, R6, R8 · **Dependencies:** U1
**Files:** Create: `supabase/migrations/0001_core.sql`, `supabase/migrations/0002_reference.sql`, `packages/shared/src/types.ts` (generated + zod)
**Approach:** Tables per High-Level Design, hardened per deepening findings:
- **Documents/serving:** opaque UUID object keys (`storage_path` never embeds filename/email — original filename is a column only); document reads are **server-proxied through an authenticated API route after ownership check** (preferred over signed URLs given D9 API-first; if signed URLs are used anywhere, TTL ≤120s, generated per-request, never persisted to DB/events/emails); `Referrer-Policy: no-referrer` on document-rendering pages; all emails contain sign-in links only, never document URLs. Break-glass revocation = project key rotation, documented.
- **Versioning/money:** `documents.version_number` with unique `(version_group, version_number)`, exactly-one-original rule per group, `content_hash` for byte-identical re-upload detection; all monetary columns integer cents (data #1).
- **Engine runs:** `engine_runs` table (case_id, check/ref versions map, status, completed_at); `findings.run_id` NOT NULL; unique `(run_id, check_id, evidence_key)`; case carries current-run pointer (data #2).
- **Reference tables:** version label part of each table's unique key; refreshes insert new version sets, never mutate prior (data #4).
- **State integrity:** transition-validation trigger encoding the legal V0 from→to table — reserved V1 states are rejected by constraint, not comment (data #5).
- **Event log:** `case_events` INSERT+SELECT policies only, block-mutation trigger even for service role, with the anonymous-purge job as the single documented deletion bypass (data #6). `payload_jsonb` allowlist: IDs, states, event types — never extracted document text (security #4).
- **Purge (design here, implementation in U17):** predicate = owner `is_anonymous = true` AND inactivity > 30 days (decided; never document age alone); row-locked selection; executed as pg_cron → pg_net → internal route using the **Storage API** — SQL row deletion alone cannot remove object bytes (review F2); deletes storage objects by enumerating rows' `storage_path`, then rows, then Supabase anon auth users (data #3, security #2).
- **Service-role boundary (review S5):** AGENTS.md usage map listing every context receiving the service key (purge route, reconciler, workflow steps); CI lint forbidding it in client-facing paths; Supabase asymmetric API keys from day one (legacy keys sunset late 2026).
- pg_cron jobs registered: daily reconciliation (stub route created in this unit — `apps/web/app/api/cron/reconcile/route.ts` returns 200 no-op until U7 fills the logic, so the cron never 404s during Phase B — review G1), +21d S5 reminders (pg_cron → pg_net → internal route sending via the U1 email provider), anonymous purge (job registered; handler lands in U17).
**Test scenarios:** Error: cross-user select on `cases`/`documents` denied by RLS; Error: UPDATE/DELETE on `case_events` fails under authenticated AND service-role connections; Error: write of reserved V1 state rejected by trigger; Happy: case insert emits `case_events` row; Error: expired/foreign signed URL (if used) rejected. (Purge tests live in U17 with the purge implementation.)
**Verification:** RLS + adversarial test suite passes against local Supabase; Security Advisor clean.

### U3. Auth, session→account claim, my-bills shell

**Goal:** Anonymous start, account at triage, my-bills list with status chips and state-conditional actions (buttons stubbed).
**Requirements:** R5, R8, R10 · **Dependencies:** U2
**Files:** Create: `apps/web/app/(case)/bills/page.tsx` (my-bills), `apps/web/app/api/auth/*`, `apps/web/lib/session.ts`, `apps/web/middleware.ts` · Test: `apps/web/tests/auth-claim.test.ts`
**Approach:** Supabase anonymous auth → in-place conversion at S4 (same `auth.uid()`, RLS holds — the only conversion path in this unit). **Auth middleware (review S1):** `middleware.ts` validates the Supabase session on every route under `app/api/` and `app/(case)/`, and enforces Origin-matches-Host on all state-mutating POSTs (App Router API routes get no automatic CSRF protection); the middleware is the authorization layer, RLS is the backstop. **The email-collision claim path — the highest-blast-radius auth surface (security #1) — is split to U18** (post-demo, pre-real-users): until U18 lands, a collision attempt gets "sign in to your existing account first, then start this bill" and attaches nothing. `external_ref` supported on case create (arch D1 user model).
**Test scenarios:** Happy: anonymous uploads doc → creates account in place → doc owned by account; Error: POST to `/api/cases/[id]/actions` with user A's valid JWT against user B's case → 403 at the route layer before RLS (S1); Error: mutating POST with mismatched Origin → rejected; Edge: email-exists collision → no attach, sign-in-first message (full claim path tested in U18); Integration: my-bills lists only own cases (RLS).
**Verification:** A user can return after a week and find their case in my-bills; middleware negative tests pass.

### Phase B — Hackathon slice (target: demoable June 27)

### U4. Upload, classification, graceful reject, dedupe

**Goal:** S2 multi-doc capture works on mobile web; D1 classification routes non-bills to a real reject screen; duplicate bills attach to existing cases.
**Requirements:** R1, R5 · **Dependencies:** U3
**Files:** Create: `apps/web/app/(case)/upload/page.tsx` (S2), `apps/web/app/(case)/upload/reject.tsx` (new S2b), `apps/web/app/api/documents/route.ts` · Test: `apps/web/tests/upload.test.ts`
**Approach:** Camera input + PDF drop, multi-page; classifier (Sonnet, structured output: bill|eob|gfe|receipt|collection_notice|other + quality flags — `collection_notice` added per review A3 to gate the FDCPA letter; classifier also extracts provider/account #/DOS so upload-time dedupe can fire) runs cheap on first page; S2b copy per classification ("this looks like an EOB — we need the bill too; both help") with targeted re-shoot (flow finding #3). Dedupe per Key Technical Decisions (finding #16): match → "continue existing case" sheet. **Hostile-input hardening (deepening: security #5):** server-side magic-byte validation against allowlist (**JPEG/PNG/PDF — HEIC excluded per review F6+A8**: Sonnet vision doesn't accept it; omit HEIC from the accept attribute so iOS Safari transcodes library picks to JPEG client-side, and reject raw HEIC stragglers with "export as JPEG or re-take with the camera" copy); hard size (~≤20MB) and page-count caps enforced before enqueue; server-set content type + `Content-Disposition: attachment` (or proxy-only rendering); per-anon-session and per-IP rate limits with challenge above threshold; LLM spend budget alarm as kill switch + auth-gated AI actions — both required before the day-1 public URL ships (Pedro: public URL from day 1 with login-gated AI; see Phase B deploy note).
**Test scenarios:** Happy: 3-page bill photo set → one document, queued; Edge: EOB-only upload → S2b with EOB-specific copy; Edge: same provider+account+DOS re-upload → attach-as-version prompt; Error: unreadable blur → re-shoot request naming the page; Error: PDF with mismatched magic bytes rejected; Error: raw HEIC rejected with export-as-JPEG copy; Error: oversize/over-page-count rejected pre-queue; Error: N+1th upload in window rate-limited; Edge: adversarial text in document cannot flip classification into a review-skipping path (security #3).
**Verification:** All four classification routes reachable in demo.

### U5. Parse pipeline (queue worker → ParsedBill)

**Goal:** Queued documents parse to typed line items with per-field confidence; paired facility/professional bills group under one case.
**Requirements:** R1, R2 · **Dependencies:** U4
**Files:** Create: `apps/web/lib/parse/run-parse.ts` (invoked as a WDK workflow step), `packages/shared/src/schemas/parsed-bill.ts` · Test: `packages/engine/eval/parse.fixtures.test.ts`
**Approach:** **The WDK workflow is the sole parse orchestrator in V0** (review F1+A7, refining arch D5): the workflow's parse step calls `run-parse` directly — WDK durable steps + retries replace queue semantics, eliminating the two-retry-systems race; pgmq returns when non-workflow fan-out exists. Sonnet vision, inline bytes, structured outputs (arch D3); summary-vs-itemized detection (D2), adjudication-visible (D3), paired-bill signal (same DOS, different provider types → group + suppress cross-doc C3, finding #15). Low-confidence fields flagged for S3 confirm. **Arithmetic reconciliation gate (review A1):** independently extract the document's printed total; sum(line_items) must reconcile within tolerance before AUDITED — mismatch forces full-line S3 review, not just low-confidence fields. **PHASE gate (review S3):** in `PHASE=A`, the Anthropic call requires the document to belong to a flagged test/synthetic account — fail closed otherwise, making the pre-BAA boundary machine-checked. **Core integrity invariant (deepening: security #3): document text is untrusted data** — the engine and router consume only typed `line_items`/`ParsedBill`, never raw text; no LLM output can create, suppress, or rescore a finding. **Error sanitization (security #4):** all step errors pass through a sanitizing wrapper logging error class/code + document ID only; zod issues and SDK error objects (which echo document content) are never logged raw — the full error payload goes to the `ai_calls` ledger row (DB, not logs) for debugging. **All Anthropic calls route through the shared LLM client wrapper, which writes an `ai_calls` ledger row per call** (Key Technical Decisions) — direct SDK use outside the wrapper is lint-banned.
**Test scenarios:** Happy: synthetic itemized bill → all line items, codes, amounts extracted; Happy: summary bill → category lines, `itemized=false`; Edge: facility+professional pair → one case, two documents, paired flag; Error: replayed/re-executed parse step → exactly one line_items set per document version (F1); Edge: line-sum vs. printed-total mismatch → full-line confirm required before AUDITED (A1); Error: PHASE=A + non-test-account document → refused before any Anthropic call (S3); Error: parse failure → step retries then surfaces "we couldn't read this" with re-shoot; **Edge: bill containing adversarial instructions parses with zero behavioral deviation**; Error: induced schema-validation failure and induced LLM-output failure produce log entries containing zero document-derived strings.
**Verification:** Parse fixtures pass; S3 renders extraction with per-field confidence flags.

### U6. Confirm + decode + attestation (S3, S3b)

**Goal:** User corrects extraction, sees plain-English line meanings, attests per line; receipts prompt when "already paid" flagged.
**Requirements:** R1, R3 · **Dependencies:** U5
**Files:** Create: `apps/web/app/(case)/[id]/confirm/page.tsx`, `apps/web/app/(case)/[id]/decode/page.tsx` · Test: `apps/web/tests/decode.test.ts`
**Approach:** Decode = LLM plain-English anchored to document's own text + code number (no AMA text — arch/AMA verdict); explicit "skip for now" (finding #18); attestation writes `attestations` rows; "didn't happen" stored for letters (records-request paragraph) and V1 C11. **Edit lock (deepening: data #1):** confirm-screen edits to the original parse close at AUDITED — after that, corrections create a new statement version, never in-place mutation (protects the frozen savings baseline).
**Test scenarios:** Happy: edit a misparsed amount → ParsedBill updated + event logged; Happy: "didn't happen" on a line → stored, later letter contains records-request paragraph; Edge: skip attestation → flow continues, verdict unaffected.
**Verification:** Demo bill shows decoded lines with attestation pills.

### U7. Case workflow (WDK) + cron jobs

**Goal:** One durable workflow per case orchestrates parse→audit→verdict; reconciliation sweep and scheduled jobs run.
**Requirements:** R9, R8 · **Dependencies:** U5
**Files:** Create: `apps/web/workflows/case-lifecycle.ts`, `apps/web/app/api/cron/reconcile/route.ts` · Test: `apps/web/tests/workflow.test.ts`
**Approach:** Payloads = case ID only (arch D7); steps fetch from Supabase; V0 workflow is short (no month sleeps yet) — it exists to be the hackathon centerpiece and the V1 spine. **Race-safety (deepening: data #5):** all state writes are compare-and-set (update-where-state-equals-expected); every step re-reads case state and aborts without writing if the case is terminal (CLOSED_BY_USER, RESOLVED_*); the pg_cron sweep re-enqueues only on expired lease/heartbeat, never mere in-flight-ness.
**Test scenarios:** Happy: upload → workflow completes → case state VERDICT; Error: kill worker mid-engine-run → re-enqueue produces exactly one completed run and one findings set feeding the verdict (data #2); Edge: sweep fires while workflow still alive → no second writer; Edge: user closes case mid-workflow → workflow aborts at next step, zero writes after terminal state; Integration: no document bytes or derived text appear in workflow payloads, pgmq message bodies, or logs (security #4).
**Verification:** Workflow visible in Vercel dashboard completing end-to-end on a demo bill.

### U8. Engine v0 (C3/C4/C5), coverage map, eval harness

**Goal:** First deterministic checks run versioned with evidence; coverage map produced; eval harness gates CI.
**Requirements:** R2, R3, R7 · **Dependencies:** U5; U2 reference tables
**Files:** Create: `packages/engine/src/checks/{c3-duplicates,c4-ncci,c5-mue}.ts`, `packages/engine/src/coverage.ts`, `packages/engine/src/run.ts`, `packages/engine/eval/{runner.ts,fixtures/*}` · Test: in-package
**Approach:** Check interface: `(caseInput, refs) → Finding[]`; C3 single-document scope + paired suppression; NCCI/MUE seed loaders in `supabase/seed/` with version stamps recorded on findings. **Run semantics (deepening: data #2):** findings are written append-only under a new `engine_runs` row; the run completes in the same transaction as its findings (fully present or invisible); the verdict router consumes only the case's current completed run; dead incomplete runs are marked by the sweep. Eval runner: fixtures = synthetic case JSON + expected findings; CI fails on regression.
**Test scenarios:** Happy: duplicate CPT same doc/date → C3 HIGH finding with line evidence; Edge: same code across paired docs → suppressed + explainer finding; Happy: MUE-exceeding units → C5 finding with table version; Error: missing codes (summary bill) → checks report skipped-no-data into coverage map, never zero-finding silence.
**Verification:** `pnpm eval` green on ≥5 fixtures including the paired-bill case.

### U9. Letters v0 + S12/S13 + closure panel

**Goal:** Dispute letter generated from findings with citations, user-edited/approved, downloaded as PDF; portal-guided option; post-download next-steps panel.
**Requirements:** R4 · **Dependencies:** U8
**Files:** Create: `apps/web/app/(case)/[id]/plan/page.tsx` (S12), `apps/web/app/(case)/[id]/letter/page.tsx` (S13), `apps/web/app/api/artifacts/route.ts`, `packages/shared/src/templates/` · Test: `apps/web/tests/letter.test.ts`
**Approach:** Letter gen = direct Anthropic call with citations on document blocks (arch D3); **citation excerpts validated server-side to literally exist in the source document before a letter renders — fail closed on mismatch** (deepening: security #3); **every dollar figure in a letter must equal a user-confirmed line item or finding amount — same fail-closed treatment** (review A1); **bounded templates (review A4):** statutory and claim-bearing language is fixed template text in `packages/shared/src/templates/`, the LLM fills only delimited factual sections — connective prose cannot escalate findings into accusations; approval screen carries a fact-attestation block ("I confirm these facts are accurate; this letter is sent in my name") stored as the approval event payload, plus a not-legal-advice disclaimer component on S12/S13; artifacts reference finding IDs (hence run IDs) so re-audits never orphan a delivered letter's citations (data #2); closure panel copy per flow finding #21 ("mail or portal-submit; expect ~30 days — by [date]; come back and tell us what happened; corrected statement → we verify savings"). `response_expected_by` deadline row written.
**Test scenarios:** Happy: CONTEST case → letter cites each HIGH finding with line numbers; Happy: attested "didn't happen" line → records-request paragraph present, phrased as question; Error: letter containing a dollar figure not traceable to a confirmed amount → render blocked (A1); Happy: letter output contains no claim-bearing language outside template bounds (A4); Edge: user edits letter → edited version is what renders to PDF; Integration: approval event (with fact-attestation payload) in `case_events` before artifact downloadable.
**Verification:** **Hackathon demo: synthetic bill → parse → decode → findings → letter PDF, live, through the WDK workflow.** Deploy mode (revised per Pedro, Proof review — supersedes the F4+A6 no-public-URL call): **public URL from day 1** — the app deploys at its real URL with every AI-invoking action behind an authenticated session plus a lightweight access gate (invite/allowlist) until launch; per-account rate limits and the LLM spend alarm ship before the URL does; the heavier anonymous-funnel hardening (per-IP limits, challenge) lands before the anonymous flow opens publicly. U17/U18 still gate real users, not the demo.

### Phase B.5 — Post-demo hardening (gates real users, not the demo — review F4+A6)

### U17. Purge implementation + remaining schema-integrity suites

**Goal:** The anonymous-purge job actually deletes bytes, and the purge/event-log adversarial suites pass.
**Requirements:** R8 · **Dependencies:** U2
**Files:** Create: `apps/web/app/api/jobs/purge/route.ts` · Test: `apps/web/tests/purge.test.ts`
**Approach:** pg_cron → pg_net → this route (service role): row-locked selection on the U2 predicate, object deletion via the **Storage API** (review F2), then rows (including `ai_calls` rows referencing the purged cases — the ledger follows the same lifecycle), then anon auth users; batch-capped so runs stay inside pg_cron's 10-minute window.
**Test scenarios:** Edge: anonymous docs older than 30 days → storage object 404s via service key (bytes gone, not just rows) + rows + anon user gone; **Edge (negative-space): claimed account with documents older than 30 days untouched**; Edge: batch cap respected on a large backlog (partial run resumes next tick, no half-deleted user).
**Verification:** Purge suite green against local Supabase before any non-synthetic user exists.

### U18. Email-collision claim path (the highest-blast-radius auth surface)

**Goal:** A user who started anonymously and enters an email that already has an account can claim their session safely.
**Requirements:** R5, R8 · **Dependencies:** U3; must land before account-conversion UI ships to real users (gates U10 in production, not in demo)
**Files:** Create: `apps/web/app/api/auth/claim/route.ts` · Test: `apps/web/tests/auth-claim-collision.test.ts`
**Approach:** Per deepening security #1: authenticated sign-in as the target email + server-minted single-use short-TTL claim token bound to (anon uid, target email); token consumption re-parents rows atomically with a `case_events` audit entry, deletes the anon user, invalidates its sessions; refresh tokens rotate on conversion; attachment never occurs on the strength of an email string; uniform error copy/timing across exists/doesn't-exist.
**Test scenarios:** Error: claim attempt with known case ID but no anon JWT → denied; Error: entering another person's email attaches nothing absent their authenticated session; Error: attacker-triggered verification email clicked by victim → no account the attacker can access; Edge: claim token single-use and expiring; Edge: claim concurrent with purge window → case and documents survive (data #3).
**Verification:** Adversarial claim suite passes; Supabase conversion semantics confirmed against current docs (risk row).

### Phase C — Complete V0

### U10. Triage (S4) + early-answer screens

**Goal:** Full question set routes cases: insured/self-pay, EOB status, collections, denial, already-paid, other-payer, state, optional income; WAIT screen (S5) with the one-shot reminder.
**Requirements:** R1, R3 · **Dependencies:** U6 (and U18 must land before conversion UI serves real users — demo path unaffected)
**Files:** Create: `apps/web/app/(case)/[id]/triage/page.tsx`, `apps/web/app/(case)/[id]/wait/page.tsx` (S5) · Test: `apps/web/tests/triage.test.ts`
**Approach:** Conversational cards; "not sure" allowed everywhere; answers set routing flags (D4/D5/D6/D14/D15); GFE/receipt conditional prompt here per finding #10 (official V0 intake for C8/C13 inputs); account conversion fires here (U3).
**Test scenarios:** Happy: pre-adjudication insured → S5 with +21d reminder scheduled; Edge: collections=yes → VALIDATE flag set (letter in U13) + urgent copy; Edge: denial=yes → APPEAL flag (handoff in U12); Happy: self-pay + GFE prompt → GFE doc attached, C8 enabled in coverage map.
**Verification:** Each triage answer combination produces the documented routing flags (table-driven test).

### U11. Engine completion: C13, C8, C10, C9 + reference seeds

**Goal:** Full V0 deterministic battery with seeded reference data and quarterly-refresh scripts.
**Requirements:** R2, R3, R7 · **Dependencies:** U8, U10
**Files:** Create: `packages/engine/src/checks/{c13-payments,c8-gfe,c10-benchmark,c9-fap}.ts`, `supabase/seed/{medicare_rates,fap_policies}.ts`, `scripts/refresh-reference.ts` · Test: in-package eval fixtures
**Approach:** C13 = receipts/attested payments vs. bill credits; C8 = GFE delta > $400 → PPDR lever with statically computed file-by date (finding #11); C10 = Medicare-multiple anchor (seeded fee schedule; honest "anchor only" framing); C9 = income vs. seeded FAP set (~10 hospitals; degraded copy otherwise). **Sourcing (review F5):** quarterly NCCI/MUE/PFS files are manually downloaded (CMS's click-through license gates automated fetch) into `supabase/seed/raw/<version>/`; `refresh-reference.ts` ingests local files only, never fetches. V0 `medicare_rates` = CMS PFS national unadjusted amounts; facility-only lines report skipped-no-data on the coverage map for C10 until OPPS rates are added. **Refresh contract (deepening: data #4):** `refresh-reference.ts` is insert-only of new version sets, idempotent per version (re-running a quarter is a no-op or loud failure), forbidden from touching prior versions; the engine resolves the current version set at run start and stamps the per-table version map on the run.
**Test scenarios:** Happy: receipt $500 + zero credits → C13 finding $500; Happy: GFE $1,000, bill $1,800 → C8 finding + `ppdr_file_by` deadline; Edge: hospital not in FAP set → C9 reports skipped-no-data with "tell us your hospital" prompt; Happy: code billed at 5× Medicare → C10 negotiation-anchor finding (never labeled "error").
**Verification:** Eval fixtures cover every check; refresh script re-seeds without breaking version stamps on existing findings.

### U12. D10 router v0.2 with coverage gating + verdict screens

**Goal:** Full cascade (premise → status gates → fights → affordability) with V0 honesty gates; all reachable verdict screens built.
**Requirements:** R3 · **Dependencies:** U11
**Files:** Create: `packages/engine/src/verdict/router.ts`, `apps/web/app/(case)/[id]/verdict/page.tsx` (S11 + S11b/c/e variants, S11d handoff variant), `apps/web/app/(case)/[id]/audit/page.tsx` (S10 from coverage map) · Test: router table-driven tests in-package
**Approach:** Implements stacking (primary + tracks ordered by deadline); **PAY gate clarified (review, coherence decision): PAY requires (a) itemized bill present, (b) C3/C4/C5/C10 all ran, AND (c) zero actionable findings — summary bills route to GET_ITEMIZED regardless, never PAY**; GET_ITEMIZED primary verdict for code-less bills (finding #17); APPEAL renders routing + deadline warning + handoff links, no generation (finding #8), and **writes a null-dated `APPEAL_WINDOW` deadlines row (`source=user_reported`) with an "enter your denial date to compute your deadline" input** so the pg_cron backstop can cover appeal windows (review G2); S10 renders ran/skipped/not-yet-available from the coverage map (finding #20).
**Test scenarios:** Happy: itemized + findings → CONTEST with stacked REDUCE when FAP-eligible; Edge: summary insured bill, 3 checks run, nothing found → "no issues in the 3 checks we could run" + unlock list, never "checks out"; Edge: itemized, full battery, clean → PAY (S11b) with honest count; Edge: denial=yes → APPEAL handoff screen with "find your denial date" warning; Happy: already-paid premise → REJECT (S11e) citing C13.
**Verification:** Router test matrix covers every verdict × coverage combination the spec's decision index defines for V0.

### U13. Artifact set completion + portal-guided delivery

**Goal:** FDCPA validation letter, S9-lite itemized request, FAP application prefill, PPDR guide — all behind the DeliveryChannel interface (download + portal-guided).
**Requirements:** R4 · **Dependencies:** U12
**Files:** Create: `packages/shared/src/templates/{validation,itemized-request,fap-application,ppdr-guide}.ts`, `apps/web/lib/delivery/{download,portal-guided}.ts` · Test: `apps/web/tests/artifacts.test.ts`
**Approach:** **Validation letter requires the actual collection notice (review A3 — same evidentiary standard the plan applies to APPEAL):** upload/identification of the notice (`collection_notice` classifier kind from U4) + collector name/address confirmed from that document; collections=yes *without* a notice → urgent guidance + "upload the letter you received" (FDCPA rights generally don't attach to original creditors — the notice is what proves a third-party collector). S9-lite = free DIY itemized request + "check their portal first" tip (finding #17); PPDR = portal-guided steps to the federal process + computed file-by date; portal-guided channel = per-artifact instructions + paste-ready text (arch D8). **Retrofit (review G3):** U9's dispute-letter download path moves behind the DeliveryChannel interface here — U13 is the unification point.
**Test scenarios:** Happy: collections=yes + notice uploaded → validation letter with collector details from the notice, available regardless of primary verdict (stacking); Edge: collections=yes without notice → urgent guidance, no letter; Happy: GET_ITEMIZED verdict → S9-lite letter + portal tip; Edge: FAP artifact for unseeded hospital → generic application checklist, honest copy.
**Verification:** Every V0 verdict/track combination offers at least one artifact; none dead-ends.

### U14. Resolution-lite: state actions, corrected-statement re-upload, PWYW

**Goal:** Cases resolve: my-bills actions advance state; corrected statement diffs to verified savings; PWYW (Stripe test mode) fires only on verified savings.
**Requirements:** R5, R6 · **Dependencies:** U9, U13
**Files:** Create: `apps/web/app/(case)/[id]/outcome/page.tsx` (S16), `apps/web/app/api/cases/[id]/actions/route.ts`, `apps/web/lib/savings-diff.ts` · Test: `apps/web/tests/resolution.test.ts`
**Approach:** Actions per finding #2/#13: "I sent it" (→SENT_BY_USER + expected-by line), "tell us what happened" (4-chip self-report → RESOLVED_SELF_REPORTED; optional upload), "add document" (WAITING_* exit → re-audit), "close." Corrected statement rides the U4/U5 pipeline as a statement version. **Frozen-baseline diff (deepening: data #1):** verified savings = frozen original snapshot (totals snapshotted at AUDITED/VERDICT) vs. latest completed-parse corrected version — recomputed deterministically, never accumulated. **Anti-phantom-savings gates (review A2):** corrected-statement totals get S3-style user confirmation before the diff runs; deltas below an absolute/percentage floor — or re-uploads matching provider+account+DOS with no changed line items — yield "no verified savings" with honest copy (a re-photo of the same statement must never mint savings); → RESOLVED_VERIFIED → S16 with anchored slider (suggested ≈10%, $0 allowed, prosocial frame). Self-reported positive outcomes get the unanchored PWYW ask — no dollar claim — plus an upload-to-verify nudge; only document-verified savings get the anchored "$X saved" ask (Pedro, Proof review). **Payment integrity (security #6):** Checkout Session created server-side with bounds (min $0, sane max) and server-set metadata (opaque case UUID only — Stripe is outside any future BAA); `payments` rows written exclusively from signature-verified `checkout.session.completed` webhooks, idempotent on event ID; success-redirect alone never marks anything paid.
**Test scenarios:** Happy: corrected statement $7,702 vs. original $9,412 → verified savings $1,710 → S16 suggests $171; Edge: self-report "adjusted" without upload → RESOLVED_SELF_REPORTED, unanchored PWYW ask shown (no dollar figure), never the verified-$X ask; Edge: corrected statement *higher* than original → no savings, honest copy + next-step guidance; Edge: corrected statement uploaded twice → deterministic single savings figure, recomputed not duplicated; Edge: byte-identical "corrected" upload → $0 savings, no RESOLVED_VERIFIED; Edge: same statement re-photographed (different image, same content) → no phantom savings, no RESOLVED_VERIFIED (A2); Edge: original edited after corrected upload → verified savings unchanged (frozen baseline); Error: forged webhook (bad signature) → rejected, no row; Error: replayed webhook event → one row; Error: tampered client amount outside bounds → session creation refused; Error: redirect-without-webhook → case not marked paid.
**Verification:** Full loop demo: verdict → letter → "I sent it" → corrected upload → verified savings → PWYW test payment.

### U15. Eval harness completion + golden fixtures

**Goal:** ~10 synthetic golden cases spanning the matrix; engine docs; CI gate proven.
**Requirements:** R7 · **Dependencies:** U11, U12
**Files:** Create: `packages/engine/eval/fixtures/{001..010}/*`, `packages/engine/README.md` · Test: the harness itself
**Approach:** Fixture matrix: itemized w/ duplicates; MUE violation; NCCI pair; paired facility/professional; summary insured (GET_ITEMIZED); self-pay GFE breach; FAP-eligible; already-paid (REJECT); collections (VALIDATE stack); clean itemized (PAY); **injection golden case** (adversarial text aimed at suppressing C3 findings and inflating amounts — security #3); **reproducibility fixture** (run engine → refresh reference tables to new quarter → re-run pinned to old version set → byte-identical findings — data #4). **Anti-circularity (review A5): ≥3 fixtures derive from real photographed bills with hand-verified ground-truth line items (Pedro's own bills — Phase A permits), gating parse field-accuracy as a measured metric; engine-fixture expected findings are computed by hand from the reference tables, never captured from engine output.** Wellthy benchmark cases append later under the same format (anonymized).
**Test scenarios:** Happy: deliberately break C3 → CI fails with named fixture; Happy: fixture format documented well enough that a new case is addable without reading engine source.
**Verification:** CI red/green demonstrably tied to fixture outcomes.

### U16. Manual EOB + C1/C2/C6 — PROMOTED to core V0 (Pedro, Proof review 2026-06-12)

**Goal:** EOB upload parses to allowed/paid/patient-responsibility + CARC codes; balance-billing (C1), never-submitted (C2), denial-code liability (C6) checks run; insured CONTEST becomes fully armed.
**Requirements:** R1, R2, R3 · **Dependencies:** U5, U11
**Files:** Create: `packages/engine/src/checks/{c1-balance,c2-submission,c6-carc}.ts`, `packages/shared/src/schemas/parsed-eob.ts`, `supabase/seed/carc_rarc.ts`
**Approach:** EOB rides the existing U4/U5 pipeline (classification already detects EOBs); C1 is pure arithmetic — the single most winnable dispute class; S5 WAIT exit ("EOB arrived") becomes functional.
**Test scenarios:** Happy: bill $3,062 vs. EOB patient responsibility $1,850 → C1 finding $1,212 HIGH; Happy: CARC timely-filing code → C6 "patient not liable" finding; Edge: EOB for different DOS than bill → mismatch flagged, no false C1.
**Verification:** The spec's demo-case arithmetic ($9,412 / $2,140 / $1,710) reproduces end-to-end as a fixture.

---

## System-Wide Impact

- **Interaction graph:** parse worker, engine, router, and letter gen all consume `documents`/`line_items` — schema changes there ripple everywhere; zod schemas in `packages/shared` are the single contract.
- **Error propagation:** job failures must surface as user-visible case states ("we couldn't read this"), never silent stalls — the reconciliation sweep is the backstop.
- **State lifecycle risks:** idempotent workflow steps (re-enqueue must not duplicate findings); statement versions must never overwrite originals (savings diff depends on both).
- **API surface parity:** every screen action exists as a typed API route (mobile later); no logic in components.
- **Integration coverage:** RLS + signed-URL behavior needs real-Supabase tests, not mocks; PHI-in-logs check belongs in CI (grep workflow payloads/log calls in tests).
- **Unchanged invariants:** spec v0.2 screen semantics and arch D1–D10 are not modified by this plan — V0 gates and copy changes are additive honesty layers.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sonnet parse accuracy on poor photos under-delivers | Real-photo fixtures with hand-verified ground truth gate parse accuracy as a measured metric (U15, review A5); arithmetic reconciliation gate forces full-line review on total mismatch (U5, A1); per-field confidence + user confirm (S3); re-shoot flow |
| WDK state retention during long sleeps unconfirmed | V0 workflows are short; written confirmation pursued in parallel; pg_cron+DB fallback documented (arch D7) |
| Reference-table seeding fiddlier than expected (NCCI file formats) | U8 starts with C3 (no external table); NCCI/MUE loaders isolated in seed scripts; quarterly refresh scripted, versioned |
| V0 disappoints insured users without EOB checks | **Resolved: U16 promoted to core V0 (Pedro)** — plus honest coverage copy everywhere; WAIT path absorbs pre-adjudication |
| Stripe live mode = LLC trigger prematurely | Test mode only; flip is config + entity decision |
| Scope creep from rich spec | Tier discipline: anything not in a U-unit goes to Deferred; tier moves are Pedro's call |
| Supabase anon-conversion semantics (uid persistence, verify-link behavior on email-exists) differ from assumptions | Highest-blast-radius auth surface: confirm against current docs AND adversarial tests before U3 merges (security #1) |
| Anonymous upload endpoint = unauthenticated LLM cost surface | Auth-gated AI actions + per-account rate limits + magic-byte/size caps + spend alarm before the day-1 public URL; per-IP/challenge hardening before the anonymous funnel opens publicly (security #5, F4+A6, revised per Pedro) |
| Signed-URL irrevocability (if proxy route not chosen) | TTL ≤120s, never persisted; key rotation documented as break-glass; prefer server-proxied reads (security #2) |

**Threat actors (added per review, security-lens decision):** (1) **Bulk FDCPA-letter abuse** — a user operating the free tier as a debt-suppression service: per-account daily letter caps (~5/day) enforced at the artifact API + anomaly alerting above threshold; the A3 notice-upload gate also raises the cost of fabrication. (2) **Manipulated bills seeking favorable verdicts** (users fabricating disputes, or providers seeking clean-PAY "evidence"): letters are framed as the user's attestation (A4 bounded templates + fact-attestation at approval); verdicts carry the deterministic evidence chain and check/reference versions. (3) **Competitive scraping of engine logic** via synthetic submissions: U4 rate limits now; account-level behavioral detection noted as a monitoring requirement, not built in V0.

---

## Success Metrics

- June 27: live hackathon demo of U4→U9 slice through a WDK workflow.
- Full V0: all 10 golden fixtures pass; every V0 case reaches a terminal or actionable state (no zombies); a cold tester completes upload→verdict→letter on a synthetic bill without help.
- Engine credibility: zero findings without evidence pointers + version stamps.

---

## Sources & References

- **Origin:** product spec v0.2 (`medical-bill-app-flow-wireframes-2026-06-12.html`), architecture decisions (`medical-bill-app-architecture-decisions-2026-06-12.md`) — both in gtm-pedro `working/`.
- Flow analysis findings #1–#21 (ce-spec-flow-analyzer, 2026-06-12, this session) — minimum-closure set integrated above.
- Platform research (live, 2026-06-12): Anthropic pricing/features, Vercel WDK/HIPAA, Supabase HIPAA/queues, AMA dev program — consolidated in the architecture sheet.
- Competitive brief: `medical-bill-dispute-competitive-brief-2026-06-11.md`.
