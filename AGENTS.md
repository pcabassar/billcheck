# billcheck — agent conventions

Chat-first medical-bill advisor, currently a **prototype** (essentially a chat + a prompt).
Build it from [the plan](docs/plans/2026-06-24-001-feat-billcheck-prototype-plan.md); the "what"
lives in [the requirements](docs/brainstorms/billcheck-prototype-requirements.md).

## Process — use the installed plugins, don't freelance

- **Compound-engineering (`/ce-*`) skills run the process. Strongly prefer them, end to end:**
  `/ce-brainstorm` (what) → `/ce-plan` (how) → `/ce-work` (build) → `/ce-code-review` (review) →
  `/ce-compound` (capture learnings). Also `/ce-commit` · `/ce-debug` · `/ce-doc-review` as needed.
  Don't hand-roll these stages — run the skill.
- **The Vercel plugin owns anything Vercel. Defer to it instead of guessing the API.** This stack is
  Vercel-native (Next.js, AI SDK v6, AI Gateway, Vercel Blob, Vercel deploy), so its skills/agents are
  the source of truth: `vercel:ai-sdk`, `vercel:ai-gateway`, `vercel:vercel-storage` (Blob),
  `vercel:nextjs`, `vercel:deployments-cicd`, `vercel:vercel-cli`, and the `vercel:ai-architect` /
  `vercel:deployment-expert` agents. When a task touches Vercel, consult the relevant one before writing code.

## Keep docs current

Update the relevant docs in the **same change** as any build or decision — README, this file, the
plan/brainstorm if scope shifts, and capture a learning (`/ce-compound`) after solving something
non-obvious. Stale docs are worse than none — that drift is what derailed the previous build.

## Altitude & ethos

A prototype with no real users. Keep it **simple and positive**; let the model do the work; add
capability (tools, persistence, safety machinery) only when you watch the prototype need it. No
PHI/compliance machinery yet (own/synthetic bills only).
