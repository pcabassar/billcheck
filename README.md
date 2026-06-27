# billcheck

**A chat-first medical-bill advocate that reads your bill, tells you in plain English what's wrong and what you actually owe — and has the hands to fight it.** Upload the bill or EOB, get a grounded read on whether you should pay, then let billcheck draft the dispute letter and set a durable reminder so the deadline never slips.

Built in NYC on Vercel, Supabase, and Resend.

> *This project predates the Built in NYC hackathon — submitted for the showcase, not prize consideration (confirmed with organizers).*

---

## The problem

A confusing or wrong medical bill is one of the most stressful pieces of mail an American can get. The numbers don't reconcile, the codes are opaque, the "amount due" might not even be the amount you owe, and there's a deadline buried somewhere that you can't afford to miss. Most people either overpay out of fear or freeze.

billcheck is for that person: scared, low-confidence, holding a bill they don't understand. The job is to take them from *"what is this — do I owe it?"* to *"it's handled — drafted, tracked, and I know what's next."* The first screen should feel like relief, not homework.

This is the "ship something real" framing: not a demo that summarizes a PDF, but a working advocate that remembers your case, acts in the real world, and is trustworthy enough to hand your actual bill to.

## Demo

[▶ 90-second demo](DEMO_VIDEO_URL)

*(Drop a screenshot of the chat + a generated dispute letter here.)*

Full walkthrough and talk track: [`docs/hackathon-demo-script.md`](docs/hackathon-demo-script.md).

## Try it live

The app is live and seeded with a real, resolved case, so you can explore it with zero setup:

**→ [billcheck-ruddy.vercel.app](https://billcheck-ruddy.vercel.app)** — sign in with the shared demo account:

- **Email:** `demo@billcheck.app`
- **Password:** `PCDemo26`

You'll land in the **"Lakewood Urgent Care — $587, uninsured"** case: the full conversation (billcheck catches an emergency-room E/M code billed at an urgent care), a drafted dispute letter, a tracked follow-up deadline, and the case timeline. Click **"Your case"** (top right) to open the workspace.

> Shared throwaway demo account with synthetic data — please don't change the password. To start clean instead, just sign up with your own email.

## How it works

billcheck wraps memory, hands, and data around a deliberately frozen, already-strong model. The thesis is that the reason to use this instead of a raw chatbot isn't *better answers* — it's the things a foundation model structurally can't do: remember the case, act in the real world, and be trustworthy enough to trust with your bill.

**The agentic loop.** The chat route runs Claude Opus 4.8 — the model string `anthropic/claude-opus-4.8` is passed straight to the Vercel AI SDK, which routes it through the **Vercel AI Gateway**. The model is given 14 model-callable tools and runs in a multi-step `stopWhen` loop: it reads the document, reasons, calls tools to change real state, and continues until the case is moved forward. Capability lives in the deterministic, testable tool layer — never in prompt tuning. Every tool executes inside its own row-level-security-scoped transaction against the route-validated active case; the model never gets to choose whose data it touches.

**Native document reading.** Bills and EOBs are uploaded to owner-scoped **Vercel Blob** and inlined into the chat route, so the model reads the actual PDF or image — figures are grounded in the document, not guessed.

**World-effecting tools require approval.** The two tools that touch the outside world — generating an artifact and scheduling a reminder — surface an approval card before they run. That card is the human-review step, and the same defense against prompt injection.

**The durable smart reminder.** The agentic centerpiece is a **Vercel Workflow** (Workflow DevKit): a durable, crash-safe job that pauses until a deadline approaches, then wakes, **re-checks the live case state**, and tailors or suppresses the nudge based on what's changed — before emailing it via **Resend**. It survives restarts because the workflow endpoint lives at `.well-known/workflow/` and is deliberately excluded from the session proxy (`proxy.ts`, the Next.js 16 middleware that refreshes the Supabase session).

**Data and isolation.** State lives in **Supabase** Postgres with Supabase Auth and **row-level security**. Eight tables hold cases, documents, timeline events, deadlines, artifacts, transcripts, and a keyless de-identified aggregate store. RLS is the source of truth: one user's cases and profile can never leak to another, verified live.

## Features

1. **Chat-first triage that reads your real documents** — a single growing conversation on a strong model with a frozen system prompt; native PDF/image reading; "don't pay or sign yet" is the validated default.
2. **Persistent case memory + cross-case awareness** — cases survive turns and sessions, each with a timeline and linked documents, so related bills can be contested together.
3. **Ask-once "your situation" profile** — insurance and status (veteran, Medicaid/QMB, self-funded, income) are stored once per user and reused across every case to route the right playbook.
4. **Artifact generation — the hands** — drafts ready-to-send dispute letters, appeals, regulator complaints, and call scripts, personalized from case context and staged for your approval.
5. **Durable smart reminder + email** — a Vercel Workflow that wakes near the deadline, re-checks the case, tailors or suppresses the nudge, and emails it via Resend.
6. **Deadline / clock tracking** — tracked deadlines with dedup, reschedule, and cancel, backing the reminder.
7. **Conclusion + anonymized share card** — closing a case generates a fully PII-free share card you preview before sharing, and (with consent) writes a de-identified aggregate record.
8. **Privacy by construction** — Supabase RLS isolation on every route and tool, explicit data-share consent, and one-click account delete.

### Safety posture

A core safety behavior — never a premature "just pay it," never an invented amount owed — emerges from model choice plus the frozen prompt, and is held by a re-runnable safety probe. Across 33 simulations over 31 cases: **0 weak responses, 0 safety failures, 0 hallucinated "you owe $X," 0 premature "just pay it."** On the same statement where free-tier Haiku said "pay $1,240," Opus said "that's a statement, not your final bill — don't pay yet." In drafted artifacts, external specifics (a citation, a CPT fact) are left as attributed `[bracket]` placeholders rather than invented.

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | `^16.2.9` |
| UI | React / react-dom | `^19.2.7` |
| Language | TypeScript | `^6.0.3` |
| Runtime | Node | `>=20` |
| AI SDK | `ai` (Vercel AI SDK) | `^6.0.209` |
| AI SDK (React) | `@ai-sdk/react` | `^3.0.211` |
| Model routing | Vercel AI Gateway (model id `anthropic/claude-opus-4.8` passed to the AI SDK) | — |
| Durable workflows | `workflow` (Vercel Workflow DevKit) | `^4.5.0` |
| Database client | `drizzle-orm` | `^0.45.2` |
| Postgres driver | `postgres` | `^3.4.9` |
| Auth + DB + RLS | `@supabase/ssr` / `@supabase/supabase-js` | `^0.12.0` / `^2.108.2` |
| File storage | `@vercel/blob` | `^2.4.1` |
| Email | `resend` | `^6.16.0` |
| Validation | `zod` | `^4.4.3` |
| Markdown | `react-markdown` / `remark-gfm` | `^10.1.0` / `^4.0.1` |
| Schema tooling (dev) | `drizzle-kit` | `^0.31.10` |

## Quickstart

Requires Node `>=20`. `package.json` defines exactly three scripts: `dev`, `build`, `start`.

### 1. Environment variables

Copy the template and fill in the secrets. Public values are safe to commit; secrets go in `.env.local` (gitignored) and the Vercel project.

```bash
cp .env.example .env.local
```

**Public:**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key for the browser/SSR clients |

**Secrets:**

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase secret/service-role key (`sb_secret_...`) for the admin client (keyless aggregate store) | Required |
| `DATABASE_URL` | Supabase Supavisor **Transaction pooler** connection string (host `...pooler.supabase.com:6543`), with DB password | Required |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key routing the Opus model — read implicitly by the AI SDK, not via `process.env` | Required |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token for document upload | Required for uploads |
| `RESEND_API_KEY` | Resend API key for the smart-reminder email (read lazily; missing → clean failure, no crash) | Optional |
| `REMINDER_FROM` | Verified Resend sender; falls back to `billcheck <reminders@billcheck.example>` if unset | Optional |

### 2. Install

```bash
npm install
```

### 3. Database setup

The schema lives under `supabase/migrations/` and is the version-controlled source of truth. Apply the files **in order** against your Supabase project (via the SQL editor, the migration API, or `psql` against `DATABASE_URL`):

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_v1_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_harden_functions.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_grants.sql
```

- `0001_v1_schema.sql` — the 8 public tables, the `touch_updated_at()` trigger, and all RLS policies (scoped to the `authenticated` role).
- `0002_harden_functions.sql` — revokes client `EXECUTE` on the trigger functions.
- `0003_grants.sql` — explicit table `GRANT`s so the schema works on a fresh Postgres.

> **Do not run `drizzle-kit push`.** `drizzle.config.ts` is for type generation/inspection only — pushing would drop the RLS policies.

Verify the wiring (connection works, all 8 tables present, RLS actually engages):

```bash
node --env-file=.env.local scripts/db-check.mjs
```

Optionally verify email:

```bash
node --env-file=.env.local scripts/resend-test.mjs
```

> `next dev` loads `.env.local` automatically. The standalone Node scripts do not, so they need the explicit `--env-file=.env.local` flag.

### 4. Run

```bash
npm run dev
```

## Status

**v1 is built and running.** Verified live in production:

- **Chat + triage** — document reading and grounded triage on Opus 4.8.
- **Artifacts** — dispute letters/appeals generated, staged for approval, and saved as tracked case objects.
- **Durable reminder + email** — the Vercel Workflow wakes at the deadline, re-checks case state, and sends via Resend.
- **RLS isolation** — per-user data isolation confirmed; no cross-user leakage.

Known v1.01 candidates (cited lookup/retrieval to replace `[bracket]` placeholders, structured aggregate capture, real artifact send, anonymous onboarding, branding) are tracked in the roadmap below.

## Docs

- **v1 requirements** (the R1–R16 thesis, locked decisions, scope boundaries): [`docs/brainstorms/2026-06-25-billcheck-v1-requirements.md`](docs/brainstorms/2026-06-25-billcheck-v1-requirements.md)
- **Testing summary** (31-case tester finding: strong + safe baseline, figures grounded): [`docs/observations/SUMMARY.md`](docs/observations/SUMMARY.md)
- **v1.01 roadmap / live test log** (acceptance log + self-contained backlog): [`docs/observations/v1-live-test-notes.md`](docs/observations/v1-live-test-notes.md) · [`docs/plans/2026-06-26-002-feat-billcheck-v1-01-next-build-plan.md`](docs/plans/2026-06-26-002-feat-billcheck-v1-01-next-build-plan.md)
- **Contributing / how we build** (process, conventions, ethos): [`AGENTS.md`](AGENTS.md)
- **Demo script** (90-second walkthrough + tech list): [`docs/hackathon-demo-script.md`](docs/hackathon-demo-script.md)

## Built with Claude Code

billcheck was designed and built with [Claude Code](https://claude.com/claude-code), end to end.

**Disclaimer:** billcheck provides information, not legal or medical advice. Always confirm specifics with your provider, insurer, or a qualified professional before acting on a bill.