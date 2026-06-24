---
title: "feat: billcheck prototype — minimal chat advisor"
type: feat
status: active
date: 2026-06-24
deepened: 2026-06-24
origin: docs/brainstorms/billcheck-prototype-requirements.md
---

# feat: billcheck prototype — minimal chat advisor

## Summary

Build the prototype as a single greenfield Next.js (App Router) app: a streaming chat on the Vercel AI SDK v6 (`useChat` + one `/api/chat` route) where the user can attach PDFs and images that a Claude model reads natively, driven by one simple orchestrator system prompt. Stateless, no database, no auth — five atomic units from empty repo to a working chat deployed on Vercel.

---

## Problem Frame

The prototype exists to establish the general-model baseline on real medical documents and surface where it falls short — its output is a gap list, not a shippable product (full context in origin). This plan covers only *how* to stand up that minimal chat; the product framing, success bet, and the four gaps live in the origin doc.

---

## Requirements

- R1. A single chat conversation where the user sends text and attaches documents (PDF and image) that the orchestrator reads directly. *(origin R1)*
- R2. One orchestrator system prompt whose job is to help the user manage their bills the best way possible, basing help on what the user actually shows and saying so / asking when unsure. *(origin R2)*
- R3. Useful triage at ~general-model quality, verifiable hands-on against real bills + the hardest documented cases. *(origin Success Criteria — verified manually, see Key Technical Decisions on testing)*

**Origin actors:** A1 (User), A2 (Orchestrator)
**Origin flows:** F1 (Helping the user with a bill)

---

## Scope Boundaries

### Deferred for later

*(carried from origin — product sequencing; the gaps the prototype will map)*

- Persistence, accounts, a multi-bill "home"; case/bill/EOB as a real schema (stays a conceptual frame until then).
- A cited knowledge base; richer UX (fuller cards, guided flows); portal/insurer/FHIR connections; web research as a tool.

### Outside this product's identity

*(carried from origin — positioning)*

- A provider-side / billing-office tool; a general health-benefits or clinical adviser; a thin "paste into a general chatbot" wrapper.

### Deferred to Follow-Up Work

*(plan-local)*

- Any automated test framework — deliberately omitted (see Key Technical Decisions).
- Upload-to-blob-then-URL for large files — only if inline base64 proves too tight against Vercel's body limit.

---

## Context & Research

### Relevant Code and Patterns

- None — greenfield (confirmed by repo research). The repo holds only `docs/`, a README, `.gitignore`, and gitignored `.claude`/`.vercel` dirs. No `package.json`, no code. Scaffold fresh; do not import the archived build.
- `.gitignore` already covers `.env*`, `node_modules`, `.next`, `.vercel`, `.turbo`, etc. — **merge** `create-next-app`'s gitignore into it, don't overwrite.

### Institutional Learnings

- None — no `docs/solutions/` store (fresh repo). After the prototype lands, capture the load-bearing wiring (model/gateway config, file-part handling) via `/ce-compound` so the next iteration doesn't start blind.

### External References

- **Vercel AI SDK v6** (verified live, 2026-06-24): chat = `useChat` (`@ai-sdk/react`) + a route calling `streamText`, returning `toUIMessageStreamResponse()`; messages converted with `convertToModelMessages()`. Key v6 shifts: **the hook no longer owns the input** (you build the composer, `useState` + `sendMessage`); messages are `UIMessage`s with a `parts` array (render parts, not `content`); drive UI from `status` (`submitted`/`streaming`/`ready`/`error`); `stop()` cancels, `error` + `regenerate()` handle failures.
- **Attachments:** file parts via `sendMessage({ text, files })` (a `FileList` from `<input type="file">`); travel as base64 data URLs inline. The composer owns text **and** attachments in one send — so the chat UI and upload are tightly coupled.
- **Claude limits** (verified): PDFs read natively as documents (~32 MB / ~100 pages); images (JPEG/PNG/WebP/GIF) ~10 MB each. But the **binding** limit here is Vercel's request-body cap, which is smaller — see Key Technical Decisions.
- **Model:** AI Gateway `"provider/model"` string passed straight to `streamText` — no provider package. `"anthropic/claude-opus-4.8"` (most capable) / `"anthropic/claude-sonnet-4.6"` (recommended default).

---

## Key Technical Decisions

- **Gateway string, not a provider package.** Pass the model string directly to `streamText`; one `AI_GATEWAY_API_KEY` env var, no `@ai-sdk/anthropic`. Model swaps by editing one string.
- **Model: `anthropic/claude-opus-4.8`** (decided). Tests the ceiling — the gap list is the strongest model's residual gaps, matching the bet. Swappable to `claude-sonnet-4.6` in one string later if you want the shipping-baseline view.
- **Files via Vercel Blob (private), not inline.** The client uploads each file to a private Blob store and the route forwards the bytes server-side, so file size isn't bound by Vercel's request-body cap — the inline-base64 ~3.4 MB wall is gone and real multi-page bills work from day one. Blob is included in your Vercel plan (free at this scale). Tradeoff: documents now **persist** in a private bucket rather than vanishing — fine for the prototype (your own / synthetic bills, no real-patient PHI per scope); keep the store private and set a short retention.
- **`streamText`, not an Agent/tool loop.** File reading is native model input, not a tool call; no tools in the prototype. `maxOutputTokens` generous (~16000) so document answers don't truncate. Default Node runtime (no Edge).
- **Prompt is a tuning surface, not write-once.** Short and positive (U2); expect to revise it against the hardest cases during hands-on verification.
- **No automated test framework — verification is hands-on, by design.** The origin's success criterion is manual judgment against real documents + the gap list; an eval harness is explicitly out of scope. Each behavioral unit carries concrete *manual* smoke scenarios.
- **Capture observations, even without a framework.** The prototype's deliverable *is* the gap list, and stateless hands-on testing leaves no record — so after each session, paste the assistant's **text** replies + a one-line tag (which case, what failed) into `docs/observations/` (text only, never base64). Without this the gap list survives only on memory and loses the subtle failures. (This is the "text-only study log" the origin already blessed.)

---

## Open Questions

### Resolved During Planning

- Model wiring → gateway `"provider/model"` string. Parse tool needed? → No; Claude reads PDFs/images natively. Scaffold shape → flat-at-root single app (not a re-created monorepo).

### Deferred to Implementation

- Exact gateway env-var name (`AI_GATEWAY_API_KEY` expected) and the dotted model-id convention — verify against the installed v6 version.
- Whether `BLOB_READ_WRITE_TOKEN` is auto-injected (store created via the dashboard integration) or must be set manually — check before pasting. *(The route→model mechanism is resolved in U4: server `get()` → inline file part.)*
- **HEIC readability** (iPhone's default photo format) — verify; convert-or-reject at upload.
- Precise `sendMessage({ files })` / `FileUIPart` shape — verify against installed v6.
- [Affects U5] Deploy mechanism — Vercel CLI (`vercel --prod`) vs the project's git integration — and whether deployment protection is already enabled on the `billcheck` project. Verify at implementation.

---

## Output Structure

    billcheck/
    ├── app/
    │   ├── api/chat/route.ts      # streaming chat route (model + system prompt)
    │   ├── page.tsx               # the chat page + composer (client component)
    │   ├── layout.tsx             # root layout
    │   └── globals.css            # minimal mobile-first styling
    ├── lib/
    │   └── prompt.ts              # the orchestrator system prompt (R2)
    ├── .env.local                 # AI_GATEWAY_API_KEY + BLOB_READ_WRITE_TOKEN (gitignored)
    ├── package.json
    └── (next.config, tsconfig, etc. from create-next-app)

---

## Implementation Units

### U1. Scaffold the Next.js app + dependencies

**Goal:** An empty-repo → runnable Next.js App Router app with the AI SDK installed and the gateway key wired.

**Requirements:** R1 (foundation)

**Dependencies:** None

**Files:**
- Create: project scaffold via `create-next-app` (App Router, TypeScript) at repo root — `app/`, `package.json`, `next.config.*`, `tsconfig.json`
- Create: `.env.local` with `AI_GATEWAY_API_KEY` and `BLOB_READ_WRITE_TOKEN`
- Modify: `.gitignore` — **merge** create-next-app's entries into the existing one (which already has `.vercel`, `.turbo`, `.env*`)

**Approach:**
- Scaffold fresh (do not import archived code). Install `ai`, `@ai-sdk/react`, `zod`, `@vercel/blob` (uploads, U4), and a streaming-safe markdown renderer (`streamdown`, or `react-markdown`) for U3. Strip the default marketing `page.tsx` (replaced in U3).
- Do **not** run `vercel link` or create a project — `.vercel/` already links this dir to the existing `billcheck` project.

**Patterns to follow:** Current `create-next-app` defaults.

**Test scenarios:**
- Test expectation: none — scaffolding/config. Manual smoke: dev server boots, page renders, no type errors.

**Verification:** App runs locally; `ai` + `@ai-sdk/react` resolve; `AI_GATEWAY_API_KEY` present in `.env.local`.

---

### U2. The streaming chat route + system prompt + model

**Goal:** A working `/api/chat` endpoint that streams a Claude response, driven by the orchestrator prompt, with attachments passed through to the model.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Create: `app/api/chat/route.ts`
- Create: `lib/prompt.ts` (the system prompt)

**Approach:**
- Route reads incoming UI messages → `convertToModelMessages(messages)` → `streamText({ model, system, messages, maxOutputTokens: ~16000 })` → return `toUIMessageStreamResponse()`. Node runtime. Pass `onError`/`getErrorMessage` to `toUIMessageStreamResponse()` to surface a readable error string — by default it masks errors to a generic message, which would defeat the "clear server error" test below.
- **Do not log message bodies** (they carry document content / base64 parts); if any transcript logging is added later, text only.
- `lib/prompt.ts` — the seed prompt (R2): a medical-billing expert whose job is to help the user manage their bills the best way possible, basing help on what the user actually shows and asking when something's unclear. Short and positive — principles, not a script. A bare document with no question → say what it is and ask what they want to do. It's a tuning surface; expect to revise it as you watch it work.

**Patterns to follow:** AI SDK v6 route pattern (External References).

**Test scenarios** *(manual)*:
- Happy path: POST text → a streamed, coherent reply.
- Happy path (the bet): attach a real EOB/statement → the reply reflects the document's actual contents, not a generic answer.
- Edge case: attach a document with no text → reply names what it is and asks what the user wants.
- Error path: missing/invalid gateway key → a clear server error, not a silent hang.

**Verification:** A round-trip streams a reply grounded in an attached document — the reply reflects what's actually in the file, not a generic answer.

---

### U3. The chat UI + composer (useChat, status-driven)

**Goal:** A mobile-first chat: type a message, watch the reply stream in (rendered from `parts`), with proper streaming/error/stop states and accessibility — not a happy-path-only shell.

**Requirements:** R1

**Dependencies:** U2

**Files:**
- Modify: `app/page.tsx` (client component — the composer + thread)
- Modify: `app/globals.css`, `app/layout.tsx` (mobile-first styling)

**Approach:**
- `useChat({ transport: new DefaultChatTransport({ api: '/api/chat' }) })`. **You own the composer** — input in `useState`, submit calls `sendMessage({ text })` (the v6 hook no longer provides `input`/`handleSubmit`).
- Render `message.parts`, switching on `part.type` (`text`, `file`); run assistant text through the markdown renderer from U1 — sanitized output, which closes the XSS path (replies use bold/lists; raw text shows literal `**`). **The mockup's amber `verdict` block is illustrative only** — the prototype renders markdown, not structured cards (cards are deferred), so don't build a card parser.
- **Drive all UI from `status`:** typing indicator on `submitted`; **Send replaced by a Stop button during `streaming`** (`stop()`); on `error`, an **inline error bubble with Retry** (`regenerate()`) that keeps the user's text — never an indefinite hang.
- **Auto-scroll only when pinned to bottom** (don't yank the thread while the user reads scrollback). Docked composer sized with `100dvh` + `padding-bottom: env(safe-area-inset-bottom)` (not `100vh`, which causes the iOS keyboard-overlap bug).
- **Empty state + a11y:** port the mockup's empty state (starter chips + the "information, not legal/medical advice" disclaimer); wrap the thread in one persistent `role="log" aria-live="polite"` region (don't remount per message); `aria-label`s on the icon-only attach/send buttons; a label on the textarea.

**Patterns to follow:** AI SDK v6 `useChat` parts + status; the mockup ([2026-06-24-billcheck-prototype-mockup.html](docs/plans/2026-06-24-billcheck-prototype-mockup.html)) for empty-state, chips, disclaimer.

**Test scenarios** *(manual)*:
- Happy path: send → user bubble, assistant reply streams token-by-token and renders markdown.
- Error path: gateway/network failure mid-stream → inline error + working Retry, not a forever typing indicator.
- Streaming control: during a reply, Send becomes Stop; tapping Stop halts the stream.
- Edge case: scroll up while a long reply streams → thread does not yank to bottom.
- Edge case: empty input → submit is a no-op.

**Verification:** A full conversation works on a narrow viewport, including a forced error (retry works) and a mid-stream stop.

---

### U4. Document upload via Vercel Blob

**Goal:** Attach PDFs/images that the model reads — uploaded to a private Vercel Blob store so file size isn't capped by the request body (no inline-base64 wall).

**Requirements:** R1, R3

**Dependencies:** U3

**Files:**
- Create: `app/api/blob-upload/route.ts` (the client-upload token route — `handleUpload`)
- Modify: `app/page.tsx` (client upload to Blob + chips)
- Modify: `app/api/chat/route.ts` (resolve each Blob ref server-side → inline file part)
- Modify: `app/globals.css` (attachment chip styling)

**Approach:**
- **Client upload to a private store via a token route** (verified pattern): the browser calls `upload(pathname, file, { access: 'private', handleUploadUrl: '/api/blob-upload', onUploadProgress })` from `@vercel/blob/client`; the route uses `handleUpload({ onBeforeGenerateToken, onUploadCompleted })` and the browser never holds the token. The file goes **browser → Blob directly**, bypassing the function's ~4.5 MB body limit. (Not bare `put()` — that's server-only and routes the file back through the function.)
- **`onBeforeGenerateToken` is the real gate:** set `addRandomSuffix: true`, `allowedContentTypes: ['application/pdf','image/jpeg','image/png','image/webp']`, and `maximumSizeInBytes` (Claude's ceilings: PDF ~32 MB / ~100 pages, image ~10 MB). The client `accept` attr + a friendly type/size message are just UX; this is the enforcement. **Flag HEIC** (iPhone default) — verify/convert-or-reject.
- **File → model: server fetch, inline** (resolved): `/api/chat` calls `get(pathname, { access: 'private' })` (uses `BLOB_READ_WRITE_TOKEN`), reads the bytes, builds an AI SDK v6 file part `{ type: 'file', mediaType, data }` → `convertToModelMessages` → `streamText`. Claude reads PDFs/images as inline base64 — it does **not** fetch URLs, so passing a (even signed) URL is a dead end for a private store.
- **Delete the blob after the model reads it** (`del(url)`) — otherwise the "stateless" prototype quietly becomes a bucket that fills with bills. A real requirement, not a footnote.
- **Render sent attachments as read-only chips** in the thread (spinner while uploading) so they don't vanish after send.

**Patterns to follow:** `@vercel/blob/client` `upload` + `handleUpload`; server `get()` → inline AI SDK v6 file part.

**Test scenarios** *(manual)*:
- Happy path: attach a **multi-page** PDF bill + "what is this?" → reply identifies it from the document (the case the old base64 path couldn't handle).
- Happy path: attach a JPEG photo of a bill → reply reads it.
- Edge case: attach a `.docx` or `.heic` → rejected with a friendly message.
- Edge case: send text with no attachment → still works (U3 path unaffected).

**Verification:** Real multi-page bills and photos reach the model regardless of size; uploaded files land in the private Blob store and aren't publicly reachable.

---

### U5. Deploy to Vercel

**Goal:** The prototype is live at a URL on the existing `billcheck` Vercel project — usable on a real phone, which is where photo-of-a-bill testing actually happens.

**Requirements:** R1

**Dependencies:** U1–U4 (a working local app)

**Files:**
- Modify: `package.json` (`engines.node` → `24.x`, to match the project). Otherwise no new files — Next.js needs no `vercel.json`; the `.vercel/` link exists. **Project setting (not a file): reset Root Directory to the repo root.**

**Approach:**
- **Fix the Root Directory first — the #1 first-deploy blocker.** The `billcheck` project still has Root Directory = `apps/web` (V0 monorepo leftover); reset it to the repo root (blank) for this single-app repo, and commit a fresh lockfile. Pin `engines.node` to the project's `24.x`.
- **Deploy via git integration (confirmed active):** push a branch / open a PR → a **preview** deploy (a `billcheck-git-<branch>…vercel.app` URL to test on a phone); merge to `main` → **production**. Test on the branch preview before promoting. (`vercel --prod` CLI is a manual fallback only.)
- **Set both env vars per-environment — Production *and* Preview** (you test on preview): `AI_GATEWAY_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Dashboard for first setup, then `vercel env pull` to sync local. (`BLOB_READ_WRITE_TOKEN` may already be auto-injected if the store was made via the dashboard — check first; OIDC can infer the gateway key on Vercel, but just set it explicitly for the prototype.)
- **Verify and enable deployment protection** (Vercel Authentication / SSO) with a scope that **covers previews** (`all`, not production-only) — otherwise the preview URLs you test on are wide-open and the gateway spend is exposed. Don't assume it's already on.

**Patterns to follow:** Standard Next.js-on-Vercel deploy.

**Test scenarios** *(manual)*:
- Happy path: open the deployed URL **on a phone** → chat loads, attach a photo of a bill → a grounded reply streams back (proves the model call works from the deployed function, not just localhost).
- Config: `AI_GATEWAY_API_KEY` unset in Vercel → a clear error, confirming the env var is the deploy-side dependency.

**Verification:** The live URL serves the chat and completes a real round-trip from a phone; access is gated by Vercel's deployment protection.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Uploaded medical documents persist in Blob storage | Private store; **delete each blob right after the model reads it** (`del`); own/synthetic bills only at prototype scale (no real-patient PHI yet, per scope) |
| The Blob upload token route has no auth — anyone who finds it could write to the private store | Acceptable at prototype scale (random-suffix keys; size + type gated in `onBeforeGenerateToken`); add auth when there are real users |
| A stream fails/drops mid-reply and the UI hangs silently | `status`/`error`-driven inline error + Retry in U3 — no indefinite typing indicator |
| HEIC photos (the "snap a photo" happy path) aren't model-readable | File-type validation + explicit HEIC flag in U4; verify/convert at implementation |
| Gateway env-var name / model id / `sendMessage({files})` signature drift | Flagged "verify at implementation" in Open Questions |
| A public prototype URL is usable by anyone and bills the gateway key | Vercel deployment protection (password/SSO) on — a platform-level gate, no app auth (U5); optionally cap the gateway key's spend |

---

## Sources & References

- **Origin document:** [docs/brainstorms/billcheck-prototype-requirements.md](docs/brainstorms/billcheck-prototype-requirements.md)
- **Design mockup:** [docs/plans/2026-06-24-billcheck-prototype-mockup.html](docs/plans/2026-06-24-billcheck-prototype-mockup.html) — clickable chat + upload UX (encodes the empty state, chips, disclaimer this plan inherits)
- AI SDK v6 wiring + Claude limits verified live (2026-06-24); flow/edge-case and best-practice passes folded into U2–U4 (the `deepened` pass).
