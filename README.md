# billcheck

A chat-first medical-bill advisor — **prototype, rebuilding from scratch.**

This repo was reset to a clean slate on 2026-06-23. The earlier builds are archived
offline; their full history remains in this repo's git log.

## What's here
- `docs/initial-research/` — research, evidence, and early brainstorm notes, carried
  forward as **inputs, not plans**. The brainstorm docs (`design-notes`,
  `intake-and-triage`, `chat-ux`) are banner-marked half-baked ideas.
- `docs/brainstorms/` — the requirements (what to build).
- `docs/plans/` — the build plan, plus a clickable UX mockup (how to build it).

## Next
Build the prototype per [the plan](docs/plans/2026-06-24-001-feat-billcheck-prototype-plan.md):
a minimal chat (Next.js + Vercel AI SDK) with document upload (via Vercel Blob) and a simple
orchestrator prompt, deployed to Vercel. Everything else gets added only when the prototype
shows it's needed.
