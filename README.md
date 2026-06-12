# billcheck

Consumer medical-bill audit: decide pay-vs-contest, then help contest — with evidence.

- **Plan of record:** `docs/plans/2026-06-12-001-feat-billcheck-v0-plan.md`
- **Conventions & invariants:** `AGENTS.md`
- **Monorepo:** `apps/web` (Next.js 16) · `packages/engine` (deterministic audit engine) · `packages/shared` (types, logger, LLM client)

## Develop

```bash
pnpm install
pnpm dev        # Next.js app
pnpm test       # unit tests
pnpm eval       # engine golden fixtures (CI gate)
pnpm typecheck && pnpm lint && pnpm build
```
