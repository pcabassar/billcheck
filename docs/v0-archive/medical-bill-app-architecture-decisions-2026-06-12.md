# Architecture Decision Sheet — Bill Check (working name)

**Date:** 2026-06-12 · **Status:** DRAFT — for Pedro's ratification, decision by decision
**Inputs:** Flow/wireframe spec v0.2 · fresh platform research (4 agents, live sources, June 12, 2026) · Pedro's 9 constraints (V0 tiering, mobile-ready, Vercel/Supabase lean, no cached knowledge, future-aware, single model, wall deferred, AMA flow check, Wellthy BYOC nice-to-have)
**Format:** each decision = recommendation → why → alternatives rejected → what it forecloses → horizon note.

---

## Feature tiers (architecture-relevant cut — final tiering debate happens in the plan)

| Tier | Features | Architecture implication |
|---|---|---|
| **V0** | Upload → parse → decode+attestation → triage → deterministic audit subset (duplicates, MUE, benchmarks, FAP screen, GFE math, payments-not-posted) → verdict → letters as free PDF download → PWYW payment link | Zero external data partnerships; needs doc pipeline, audit engine, case store, LLM calls |
| **V1** | EOB upload+CARC checks, Epic/clinical connect (C11/C12), paid send (fax/mail), case dashboard + deadline clocks + response loop, account system maturity | Needs async machinery, delivery vendors, FHIR client, payments |
| **Later** | Payer APIs at scale (Flexpa), voice agents, the wall, pro tier (Wellthy BYOC), denial-appeal generation, Spanish | Needs only *seams* now (flags, interfaces, module boundaries) |

---

## D1 — Case state machine: Postgres, explicit states, event-sourced-lite

**Recommendation:** The case lives in Supabase Postgres as the single source of truth. `cases` table with an explicit state enum (the spec's stages: CAPTURED → TRIAGED → GATHERING → AUDITED → VERDICT → EXECUTING → AWAITING_RESPONSE → RESOLVED/ESCALATED/CLOSED, + WAITING_* variants), plus an append-only `case_events` table (every transition, artifact, deadline, receipt — the audit trail), and a `deadlines` table (absolute timestamps + type: FDCPA_30D, FAP_120D, FAP_240D, APPEAL_WINDOW, RESPONSE_30D...). Findings, artifacts, attestations, consents = separate tables keyed to case.
**Why:** deadline clocks are statutory — they must survive anything; Postgres timestamps + an event log is the boring, correct answer. The event log doubles as the Wellthy-credibility audit trail and the future wall/verification evidence chain.
**User model (decided 2026-06-12):** Supabase Auth from day one (RLS and case ownership require it); account *maturity* deferred. V0 includes a "my bills" dashboard (list of user's cases + status chips — nearly free given this schema). Cases carry an optional `external_ref` string so a partner like Wellthy can run one account per client via aliased emails (`billing+<id>@wellthy.com`) with zero custom code — no integer usernames (enumerable), no coordinator dashboard unless paid (pro tier).
**Rejected:** workflow-engine-as-source-of-truth (vendor lock for legal deadlines); full event sourcing (overkill).
**Forecloses:** nothing.
**Horizon:** none needed — this is deliberately timeless.

## D2 — Audit engine: deterministic rules as code + reference tables; standalone module

**Recommendation:** Checks C1–C10/C13 are **versioned TypeScript functions over reference tables seeded into Postgres** (NCCI PTP edits, MUE, CARC/RARC, Medicare fee schedules, FAP thresholds — all public, updated quarterly via a refresh job). Judgment checks C11/C12 are LLM calls with structured outputs. Every finding records: check version, reference-table version, evidence pointers (doc + location), confidence tier, $ impact. The whole engine is a **self-contained package (`@billcheck/engine`)** with no UI/auth dependencies — callable from the web app, a CLI, or (later) inside someone else's infra.
**Why:** determinism where possible = defensibility ("finding X came from NCCI edit table 2026-Q2, rule v3") — this is what makes letters and the future wall stand up. The module boundary is simultaneously the Wellthy BYOC seam (your #9), the eval-harness seam, and the pro-tier seam — one boundary buys three options.
**Rejected:** LLM-everything (unfalsifiable, expensive, drifts); rules engine frameworks (YAGNI).
**Forecloses:** nothing.
**Eval harness (non-negotiable):** golden-case fixtures from day one — `cases/fixtures/*` with expected findings; every engine change runs against them. The Wellthy retrospective benchmark *is* the seed eval set.

## D3 — Model strategy: single Sonnet via one config var, AI SDK 6 interface

**Recommendation:** **Claude Sonnet 4.6** ($3/$15 per MTok, vision, 1M context — verified live 2026-06-12) as the only model, set in one env var. Interface: **Vercel AI SDK 6** (`ToolLoopAgent` where agentic, plain `generateObject` for extraction) with the Anthropic provider — this is also exactly the June 27 hackathon stack. Use **structured outputs** (GA) for bill/EOB extraction, **prompt caching** (1-hr tier) for the big rule-context prompts, **inline document passing** (base64; PDFs ≤100pp/32MB — bills fit easily). For dispute letters that must cite bill line items, use Anthropic's **citations** feature via a direct API call (citations and structured outputs are mutually exclusive — extraction and letter-gen are separate calls anyway).
**Why:** your #6 — no router, one model, go. The one-var config gives 90% of future routing for free.
**Rejected for now:** Files API (NOT BAA-covered — pass docs inline instead); Batch API on the PHI path (not BAA-covered); Managed Agents (compelling for long-running cases but **explicitly not BAA/ZDR eligible yet** — the conspicuous gap Anthropic seems to be closing, with self-hosted sandboxes just launched 2026-06-10); Haiku for cost (later, via the config var).
**Why inline beats Files API (clarified 2026-06-12, Pedro's question):** not "more secure" per se — two specific properties. (a) Residency/data-minimization: Files API parks the document as data-at-rest on Anthropic storage until deleted; inline means transient per-request processing with the only durable copy in our Supabase. (b) Contract coverage: Anthropic's BAA covers the Messages API but excludes the Files API entirely — a Files-based architecture puts PHI on a surface that cannot be brought under the BAA at any price. Cost of inline: re-sent bytes per request (prompt caching + 1–15-page bills make this cents) and no cross-request reuse.
**Constraint scoping:** the BAA feature constraints bind only the PHI path. Non-PHI workloads — eval fixtures, reference-table processing, synthetic/demo data — may freely use Batch (50% discount), code execution, etc., forever.
**Horizon:** Managed Agents + Files API gaining BAA coverage would let us move case sessions and doc storage to Anthropic-hosted — leave the seam (session IDs + doc refs already externalized in Postgres). "Dreaming" (cross-session agent memory, research preview) maps to learning insurer/hospital response patterns — watch.

## D4 — PHI posture: phased; PHI-grade by design, formal BAA stack at real-user launch

**The legal nuance first:** a consumer app acting as the *patient's* tool is **not a HIPAA covered entity or business associate** — HIPAA does not legally bind us. The BAA stack is a **credibility and risk choice** (Wellthy culture, trust brand), not a legal gate. **But "not HIPAA-bound" ≠ unregulated:** the FTC Health Breach Notification Rule applies specifically to non-HIPAA health apps (GoodRx $1.5M, BetterHelp $7.8M penalties), and state consumer-health-data laws (WA My Health My Data — private right of action; NV SB 370) target exactly this category. So the *practices* are mandatory under any posture; only the BAA paperwork is elective. Framing: Phase A below already IS the "secure but not HIPAA" architecture — engineering hygiene always-on at ~$0 extra, paid contracts deferred to a trigger. That makes phasing legitimate:

- **Phase A — build/dev (now → first real users):** Vercel Pro ($20) + Supabase Pro ($25). **No real third-party PHI** — synthetic bills, our own bills, and Wellthy-*anonymized* cases only. Cost: ~$45/mo + API usage.
- **Phase B — real users:** flip the switches: **Supabase Team + HIPAA add-on = $949/mo** (BAA covers DB/Auth/Storage/Edge Functions/Realtime; forces PITR+SSL+network restrictions) · **Vercel HIPAA add-on = $350/mo** (Pro, self-serve since Sep 2025) · **Anthropic BAA** (enterprise contact, covers Messages API + structured outputs + caching; 30-day retention — note BAA and zero-data-retention are mutually exclusive). **Real launch floor: ~$1,300/mo + usage.** (All figures verified live 2026-06-12.)
- **Day-one regardless of phase (cheap now, painful to retrofit):** RLS on everything, private storage buckets + short-lived signed URLs, no PHI in logs/URLs/workflow payloads (case IDs only), column-level security on PHI fields, Supabase's new asymmetric API keys (legacy keys sunset late 2026), app-layer audit log (the `case_events` table).
**Rejected:** AWS-native for free BAAs (~$50-100/mo infra but ~an engineering-week/month of ops for a 1-2 person team; revisit only if the $1,300 floor ever binds); Neon/Convex/Firebase (verified: none clearly better — Neon excludes Auth/Data-API from HIPAA and lacks queues/cron; Firebase can't do the Postgres state machine; Convex BAA claims unofficial).
**Horizon:** the Phase B trigger is a *launch decision*, not architecture — flipping it is config + contracts, not re-architecture, **provided the day-one rules above are honored**.

## D5 — Document pipeline: Supabase Storage → queue → Sonnet vision → typed objects

**Recommendation:** Upload (mobile-web camera or PDF) → private Supabase Storage bucket → row in `documents` + job in **Supabase Queues (pgmq)** → worker parses via Sonnet vision (inline bytes) with structured outputs → `DecodedBill`/`ParsedEOB` typed records + per-field confidence → user confirm/correct screens (spec S3/S3b). Attestations and redaction-status flags stored per document/finding from day one (wall + training-data seams, your #7).
**Why:** queue-decoupled parsing survives function timeouts (Edge/Vercel limits verified: 400s/800s ceilings), retries cleanly, and scales by adding workers.
**Rejected:** parse-in-request (timeout fragility); dedicated OCR vendors (Sonnet vision handles bills; revisit only if eval says otherwise).

## D6 — EOB/clinical integrations: V1, Epic-sandbox-direct first

**Recommendation:** V0 ships with **manual upload only** (EOB PDFs parse through the same D5 pipeline). V1 adds Epic patient-access via SMART on FHIR against the free sandbox (registration at fhir.epic.com), as prototyped in the spec; the **aggregator decision (Flexpa $20K/yr vs. direct vs. TEFCA) is deferred to its own later decision** — it's a check-writing decision, not a code decision. Schema carries the evidence coverage map (which checks ran / skipped and why) from day one.
**Why:** V0 needs zero partnerships; the spec's degraded-mode design already absorbs missing integrations.

## D7 — Async machinery: Vercel Workflows as orchestrator, Postgres as truth, cron as reconciler

**Recommendation:** **Vercel Workflow DevKit (GA, verified: unlimited sleep/run duration, all plans, $0.02/1K events — effectively free at our scale)** runs each case's lifecycle: parse steps, letter steps, `sleep('30d')` to deadlines, wake-and-check. Two hard rules: (1) **workflow payloads carry case IDs only, never PHI** — steps fetch from Supabase; (2) **Postgres `deadlines` is the source of truth** — a daily pg_cron sweep reconciles (catches any workflow that died) and fires anything the orchestrator missed. This belt-and-suspenders means a lost workflow can never lose a statutory deadline.
**Why:** WDK is purpose-built for exactly our shape (multi-week sleeps, crash-safe replay), it's what the June 27 hackathon will showcase (the "Zero to Agent" hackathon in April–May ran a Workflows track), and the reconciler removes the one scary failure mode.
**Action item before relying on it:** confirm with Vercel that state retention during multi-month *sleeps* is unaffected by the Pro plan's 7-days-after-completion purge (docs imply yes; get it in writing).
**Rejected:** Inngest/Trigger.dev (fine tools, but a third vendor when WDK + pg_cron covers it); cron-only (workable fallback, more glue code — it's our documented plan B).

## D8 — Delivery channels: interface now, vendors later

**Recommendation:** A `DeliveryChannel` interface (render → send → receipt → status) with V0 implementing exactly two: `download` (free PDF) and `portal-guided` (instructions + paste-ready text). Fax/certified-mail vendor selection (Lob, Documo, et al.) happens at V1 implementation — behind the interface it's a two-day swap, not an architecture call. Voice is a later channel behind the same interface.
**Why:** the interface is the decision; vendors are details.

## D9 — Stack & repo: Next.js 16 monorepo, API-first, mobile-ready

**Recommendation:** **Next.js 16 (App Router, Turbopack) on Vercel + Supabase (Postgres/Auth/Storage/Queues/Cron) + AI SDK 6 + TypeScript.** Monorepo: `packages/engine` (audit engine, D2), `packages/shared` (types/zod schemas), `apps/web` (Next.js). **All business logic behind API routes / server actions returning typed JSON — the web UI is just a client.** Mobile path (your #2): later Expo/React Native app consuming the same API; nothing in V0 may assume browser-only (no logic in components, camera via standard inputs).
**Why:** your #3 (familiarity + hackathon) confirmed by research rather than rubber-stamped: the alternatives scan found nothing clearly better for this team and shape; Supabase is stable ($500M Series F, June 2026); Vercel's agent stack is the most aligned third-party platform for the WDK pattern.
**Verified versions:** Next.js 16.2.7 · AI SDK 6 (GA Dec 2025; v7/WorkflowAgent rumored — don't wait for it).

## D10 — The wall: deferred; three flags now

**Recommendation:** No wall code in V0/V1. Day-one data hooks only: `consent_status` on cases, `redaction_status` on documents/excerpts, `verification_tier` on findings (deterministic / judgment / coder-reviewed). The wall bolts on later with zero migration.

---

## AMA CPT Developer Program — flow walked (as far as documentable), your #8

**Criticality verdict (2026-06-12): off the critical path for V0.** Bills and EOBs carry their own line descriptions (hospital chargemaster text, payer service descriptions) which we may freely parse and rephrase; the deterministic audit checks operate on code numbers (public domain); E/M leveling uses CMS's public guidelines; letters cite the bill's own text. AMA descriptors add canonical authority + bundled Spanish — grab the free dev-program access opportunistically, but V0 never waits on it.

The signup form itself is a JS app that can't be inspected without registering — but the surrounding requirements are now mapped:

- **@gmail:** no documented prohibition; the program targets "developers and innovators." Likely fine. **Unconfirmed until you're in the form.**
- **URL:** no documented URL requirement; if asked, **a Vercel subdomain with a one-page landing is a legitimate answer** — have one deployed first (5 minutes). No custom domain needed for the dev program.
- **The real prep item is the Organization field** — all AMA language says "organizations," never "individuals." Prepare a project/org name (working name or "Pedro Cabassa, sole proprietor"). This also feeds the broader **entity to-do**: LLC before commercial license / Stripe / BAAs anyway.
- **The AI/LLM question is the judgment call:** disclosing AI use routes you out of self-serve into a human review lane (survey → licensing-manager call within 10 business days). Read the actual form question carefully; answer accurately — but know that checking the box changes the timeline from same-day to weeks.
- **What you get:** CPT Standard Data File (descriptors incl. consumer-friendly; exact dev-tier descriptor scope unconfirmed) + a file-download API (10 calls/day, 3 prod users). 12 months royalty-free, build/test only.
- **Relief valve stands:** V0 can ship without AMA text (LLM explanations keyed off code numbers) if the review lane drags.

## Cost picture (verified 2026-06-12)

| Phase | Monthly | Notes |
|---|---|---|
| Build/dev (now) | ~$45 + API usage | Vercel Pro $20 + Supabase Pro $25; Sonnet usage cents/case |
| Real-user launch (HIPAA stack on) | ~$1,300 + usage | Supabase Team+HIPAA $949 + Vercel HIPAA $350 + Anthropic BAA (contract) |
| AMA | $0 yr 1, ~$1,050/yr after | Developer Program → distribution floor |

## Watch list (build-for-present seams, your #5)

Managed Agents/Files API BAA coverage (would absorb our session + doc plumbing) · Anthropic "Dreaming" (insurer-pattern memory) · AI SDK v7 WorkflowAgent · Vercel Queues GA · Supabase legacy-key sunset (late 2026 — start on new keys) · CMS-0057 APIs (Jan 2027) · AMA pricing under Senate scrutiny.

## Open items needing Pedro

1. Ratify/veto D1–D10 (D2, D4, D7 are the consequential ones).
2. Working name (entity plan decided: single-member NY LLC, formed only when a trigger fires — Wellthy contract, Stripe live, or AMA commercial license; AMA dev program proceeds as sole proprietor).
3. AMA signup session (~30 min, you at the keyboard, me alongside) — decide the AI-disclosure answer when we see the actual question.
4. Greenlight to run `/ce-plan` with spec + this sheet as inputs.
