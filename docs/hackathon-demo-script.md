# billcheck — 90-second demo script (Built in NYC)

> Format: one ~90-second Loom (or unlisted YouTube), voiceover over a screen recording of the real flow.
> 🎙️ = spoken voiceover · 🖥️ = what's on screen.

---

### 0:00–0:08 — Hook
🎙️ "Medical bills can be so confusing that some people reluctantly pay bills that are wrong, or forgo options to reduce the amount they pay. billcheck is the advocate that doesn't let that happen."

🖥️ Welcome screen → you typing / uploading.

### 0:08–0:28 — Upload + the catch
🎙️ "I get one of these confusing bills for an urgent care visit. billcheck reads the actual line items — and catches it: this visit was billed with an emergency-room code it shouldn't have been. It explains, in plain English, what's wrong and what I actually owe."

🖥️ Upload `test-bill-2` → the reply with the 99284 flag. Let the "big red flag" line sit on screen.

### 0:28–0:48 — The hands
🎙️ "I ask it to fight the charge. It asks permission first — then drafts a real dispute letter, personalized to my situation, with no made-up legal citations. One click to download and send."

🖥️ Type "draft a dispute letter" → the approval card → the letter → hit Download.

### 0:48–1:12 — The reminder (the wow — give it room)
🎙️ "Then the part I love: 'remind me to follow up.' It schedules a durable reminder that survives restarts, re-checks my case as the deadline nears, and — watch — actually emails me the nudge. A real email, in a real inbox, sent by the agent on its own."

🖥️ "remind me to follow up" → approval card → cut to your inbox showing the reminder email arriving.

### 1:12–1:28 — Wrap + close
🎙️ "When the case wraps, billcheck creates an anonymized summary I can share — no personal details. Built on Vercel, Supabase, and Resend, billcheck doesn't just explain your bill — it fights it for you."

🖥️ Mark resolved → the share-card preview → end on the billcheck logo / name.

---

## Production notes (make-or-break)
1. **Sign in as `pedrocabassa@gmail.com`** for the recording — the reminder email only delivers to your Resend-account address (the `onboarding@resend.dev` test-sender restriction).
2. **Pre-stage the email beat.** Set the reminder a few minutes before recording and cut to the already-arrived email, or have the inbox tab open and ready — don't film dead air waiting for it.
3. **One smooth take** of the real flow, with the bill and a logged-in session ready. The email landing live is the single most convincing moment — rehearse that cut.

## Tech list (for the submission "technologies used" field)
Vercel (AI SDK v6, AI Gateway, Workflows, Blob) · Supabase (Postgres + Auth + RLS) · Resend · Next.js 16 · Claude Code · Claude Opus 4.8.
