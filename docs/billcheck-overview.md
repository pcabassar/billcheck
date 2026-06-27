# billcheck — at a glance

**billcheck is a chat-first medical-bill advocate: upload a confusing bill or EOB and it tells you — in plain English — what's wrong, what you actually owe, and what to do next, then drafts the letters and sets the reminders to make it happen.**

---

## What it does

- **📄 Reads your bill** — upload a PDF or a phone photo of a bill, statement, or EOB; it reads the actual line items and figures.
- **🗣️ Plain-English verdict** — what it is, whether you really owe it, and what's wrong — and never a premature "just pay it."
- **🧠 Remembers your case** — each bill is a *Case* with a timeline; it picks up where you left off and keeps separate bills separate.
- **👤 Knows your situation** — captures your coverage once (insurer type, QMB/dual-eligible, state) and reuses it, so it never re-asks.
- **✍️ Drafts the letters (the hands)** — real dispute letters, appeals, complaints, and call scripts — personalized, with no made-up legal citations. Download or copy.
- **⏰ The smart reminder** — a *durable* workflow that waits until your deadline nears, re-checks your case, and **emails you** the nudge on its own.
- **✅ Wraps up + shares** — on resolution, an anonymized summary card (no personal details) you can share.
- **🔒 Private by design** — your data is isolated to you; sharing is opt-in and de-identified.

---

## The agent's tools

**Case & memory**
`updateCaseTitle` · `setCaseStatus` · `markResolved` · `reopenCase` · `updateProfile`

**Documents**
`linkDocument` · `relinkDocument` · `setDocumentKind`

**Artifacts — the hands**
`generateArtifact` ⚠️ · `markArtifactSent`

**Deadlines & the smart reminder**
`scheduleReminder` ⚠️ · `updateDeadline` · `cancelDeadline`

**Conclusion**
`generateShareCard`

> ⚠️ = the agent asks your permission before acting on the world.

---

*Built on Vercel (AI SDK, AI Gateway, Workflows, Blob) · Supabase (Postgres + Auth + RLS) · Resend · Claude Opus 4.8.*
