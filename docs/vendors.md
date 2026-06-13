# Vendors

Per AGENTS.md vendor policy: any SDK that captures runtime data requires a BAA
path for Phase B, PII/body capture disabled, and an entry here.

| Vendor | Use | Runtime data captured | BAA status | Phase B note |
|---|---|---|---|---|
| Anthropic | LLM (classify/parse/letter) | Document bytes + extracted text (inline per request; never via Files API) | **Required before PHASE=B in production** | Single entry point `packages/shared/src/llm/client.ts`; full I/O on the RLS-protected `ai_calls` ledger, never logs. |
| Supabase | Postgres + Storage + Auth | All PHI (the system of record) | **Team + HIPAA add-on required before PHASE=B in production** | RLS owner-only; service-role key only via `apps/web/lib/supabase/admin.ts`. |
| Vercel | Hosting + Workflow DevKit | Request metadata; platform log capture **suppressed** | **HIPAA add-on required before PHASE=B in production** | Workflow payloads carry case IDs only — no PHI in workflow state. |
| Stripe (U14) | PWYW tip checkout | Payment data only | **Outside any BAA — intentionally** | Checkout Session metadata is an opaque case UUID ONLY; never a name, never bill contents. `payments` rows written exclusively from signature-verified webhooks, idempotent on event ID. Env-guarded: inert without `STRIPE_SECRET_KEY`. |

## Stripe env

- `STRIPE_SECRET_KEY` — test mode (`sk_test_…`) until launch. Absent ⇒ PWYW is inert (503 `payments_not_configured`), the rest of resolution still works.
- `STRIPE_WEBHOOK_SECRET` — from `stripe listen` / the dashboard endpoint. The webhook rejects unsigned/forged events.
