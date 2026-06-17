# V0.1 design — Q4: Chat UX (chat-first, with inline interactive UI)

> **Status: LEADING (V0.1).** Brainstorm output, informed by mid-2026 UX research (see "Research basis").
> Not gospel. Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17._

## The vision (Pedro)
A **chat-first** experience where rich, interactive UI elements render **inside the conversation** —
cards, forms, a document viewer, an amounts panel, a timeline, action buttons — **without the user ever
leaving the chat screen.** Chat must also work **chat-only, elegantly** (every UI element degrades to
clean text). Voice is a fast-follow.

## The principle the research forces: hybrid, not chat-only-dogmatic
The 2026 consensus is **hybrid**, and there's a sharp, well-developed critique of chat-maximalism
("the conversation trap": forcing users to converse adds cognitive load — recall, formulate, wait,
parse, verify — when a tap would do). The resolution everyone converges on:
- **Conversation** for the **ambiguous / exploratory** ("I got a bill, what do I do?", their story).
- **Structured inline UI** for the **known / repeatable / verification** (confirm the coverage type,
  show the amounts, approve sending a letter, see the verdict).
- **Inline UI augments the thread; it never forces a mode switch.**

This maps perfectly onto our triage model: the *recognition/advice* is conversational; the *verdict,
the amounts, the intake facts, and the actions* are structured cards. So we are **chat-first + generative
UI**, explicitly **not** "everything must be typed."

## The technical approach: generative UI from a *trusted component catalog*
The dominant, current pattern for "the agent renders UI in chat" is **generative UI**: the model's
**tool calls map to React components** (not the model writing raw HTML). The critical finding:
**AI-*generated* markup is "inaccessible by default"** (missing buttons/ARIA/focus/labels; ~160 issues
per generated app in one audit) **and a security risk.** The safe, accessible pattern (Google A2UI's
model, echoed by CopilotKit/AG-UI) is: **the agent may only request components from a fixed, hand-built,
accessible catalog** — "the LLM never paints pixels; it selects from a pre-validated library."

**Our stack fit:** Next.js 16 / React 19 (already ours) + the **Vercel AI SDK v5** generative-UI pattern:
server `streamText` + client **`useChat`** exposing **typed `message.parts[]`** (`tool-<name>` with
`state: input-available | output-available | output-error`); switch on the part and render an owned
component (a `<VerdictCard/>` on `output-available`, a **skeleton** while pending). **Avoid the older RSC
`streamUI` (`ai/rsc`) — it's now paused/experimental;** AI SDK UI is the production path. Consider
**assistant-ui** as the chat shell (streaming, attachments, a11y, generative-UI primitives, inline
approval out of the box). Components are **shadcn/ui**-style, owned, accessible-once. **HITL** uses the
AI SDK's **`needsApproval`** flow (tool pauses → `approval-requested` → Approve/Reject/Edit in the bubble;
`addToolApprovalResponse`). This keeps the **bright line** intact: a card only displays values the tool
returned (parsed line items, engine findings, KB rules) — the model picks the card, not the numbers.

**MCP — the answer to "why not just use ChatGPT?" (strategic; fast-follow, not a V0.1 dependency).**
The worry: a general model is *right there*, so why come to billcheck? The answer: our value is **the
tools + the data / system-of-record + durable case state + the bright line** — none of which a
general model has. But making users *leave* their AI to get it is friction. **MCP removes that friction**
by letting billcheck work **inside ChatGPT/Claude**: expose our tools as an MCP server, and/or render our
cards via **MCP Apps** (Jan 2026; `ui://` resource → sandboxed iframe, JSON-RPC over postMessage,
co-authored by Anthropic/OpenAI/etc.). **Load-bearing design consequence:** because a *general host model*
may orchestrate our tools, the **bright line + guards must live in the tools themselves** (ID-bearing
facts, `validateLetter`, HITL gates) — not only in our system prompt (see [03-agent-loop-and-tools](03-agent-loop-and-tools.md)).
**Build our own chat-first (mobile-first) app as the primary surface** — we keep control of the
experience, the persistent-advocate behavior, and the bright line — and **offer MCP as a distribution
channel fast-follow.**

## The inline component catalog (mapped to our model + verdicts)
Each component is owned, accessible, and has a **text-equivalent fallback** (for chat-only/voice/SMS).

1. **Document chip + viewer.** Upload via composer "+" (camera / photo / file — the standard mobile
   three-way). Show a **thumbnail chip with page count** (Claude's pattern); tap → **full-screen viewer on
   mobile**, **side panel on web**. Text fallback: "📄 Statement, 2 pages — uploaded."
2. **Verdict card.** The headline output. Encodes the verdict in **three redundant channels** (WCAG 1.4.1
   Level A): **icon shape + semantic color + text label** — never color alone. Variants map to the
   common verdicts: ⏸ *Don't pay yet* (blue/info), ✅ *Looks correct — OK to pay* (green/success),
   ⚠ *Something looks off* (amber/critical, `role="alert"` for urgent), ❓ *Need one more thing* (neutral).
   Body = the **why** + next step. Text fallback: a clear sentence. _Why it's the hero:_ the
   **EOB-vs-bill confusion is the core consumer pain** ("this is not a bill") — **naming the document
   type and giving a clear verdict *is* the product.**
3. **Amounts panel.** Our billed / allowed / paid / owed / in-collections / disputed. Apply the money
   typographic rules: **tabular (lining) figures, right-aligned amounts, currency aligned, a visually
   emphasized total with a divider**, and **never a "surprise total" without the line items** (the #1
   abandonment cause). Text fallback: a labeled breakdown.
4. **Intake mini-form (insurance situation).** Render a small **grouped card** when fields are tightly
   related and known (coverage type, fully-insured/self-funded, used-insurance?); fall back to
   **one-question-at-a-time** when branching or thought is required. Trigger the right mobile keyboard per
   field. Text fallback: ask the questions conversationally.
5. **Status + deadline chips.** Bill lifecycle + the derived case-status rollup as chips; **deadline
   chips** with semantic urgency: **amber = due soon, red (solid) = overdue, green = done, gray/blue =
   scheduled** — always with a **text label** ("Due in 2d", "Overdue 3d"), ≥24px target. Text fallback: inline words.
6. **Activity-log / timeline.** Vertical, **timestamped, most-recent-ordered**; node states
   (done/current/upcoming/error) by icon+color+label. This is **also the agent's transparency surface**
   ("here's what I did / sent / am waiting on") **and** the evidence chain. Text fallback: a dated list.
7. **Action confirm buttons (risk-tiered HITL).** Per the 2026 consensus + "approval fatigue" research:
   **auto (no confirm)** for safe/read-only (parse, KB lookup, engine run, draft-to-draft); **confirm**
   for reversible writes; **hard-gate** irreversible/external actions — **send a letter/complaint, go to
   press, mark a bill paid**. Show a **preview before commit** and Approve / Edit / Reject. Text
   fallback: "Reply YES to send."

## Triage verdict → chat rendering (the common path)
- **"Don't pay yet."** Verdict card (⏸) + the document chip (showing it's a *statement*) + a deadline
  chip for "watch for the EOB." Conversational line explaining why.
- **"Looks correct — OK to pay."** Verdict card (✅) + the amounts panel showing the reconciliation
  (EOB cost-share = billed). Reassurance text. (Note: a real **"pay" action** is the user's; we don't
  process payment in V0.1 — we give permission + the breakdown.)
- **"Something looks off."** Verdict card (⚠) + amounts panel (flagged line) + a **ranked options menu**
  (cards or list) + an offer to draft the artifact (→ confirm button).
- **"Need one more thing."** Verdict card (❓) + the intake mini-form or an upload prompt.

## Mobile-first (many users will be on a phone)
- **Touch targets:** design to **44pt (iOS) / 48dp (Android)**; 24px is only the WCAG floor. ≥8px spacing.
- **Thumb zone:** primary actions (Send, Approve, Continue) in the **lower ~40–50%**; dock the composer
  at the bottom; hide non-essential header chrome when the keyboard is open.
- **Rich forms → bottom sheet** (more room, stays in the thumb zone); short confirmations → inline card.
- **Streaming stability (a real, named 2026 problem):** the thread shifts as tokens stream → **reserve
  space (min-height) for growing containers** and **append into the current node** rather than rebuilding;
  **auto-scroll only when the user is at the bottom**, stop the instant they scroll up.
- **Keyboard:** ensure the focused field isn't covered (iOS overlays vs Android resizes) — `scrollIntoView`
  on focus; never let the composer overlap the last message (the most common AI-chat mobile bug).

## Accessibility (also our chat-only-elegance guarantee)
- **Own the components; don't ship model-authored markup** — that's how we avoid "inaccessible by default."
- **Streaming thread = an ARIA live region with `role="log"`** (`aria-live="polite"`, `aria-atomic="false"`),
  a **single persistent region** fed by a message bus (re-mounting breaks announcements). Don't move focus
  on each new message; announce via the live region. Use `role="status"`/`4.1.3` for "AI is typing / sent".
- **Verdict & deadline chips:** text + icon, not color alone (1.4.1); contrast ≥4.5:1 text, ≥3:1 chip.
- **Focus:** visible focus, not obscured by the docked composer/sheet (2.4.7 / 2.4.11); return focus to the
  trigger when a sheet closes; full keyboard operability (2.1.1/2.1.2).
- **Text-equivalent fallbacks** (above) are what make it **work chat-only, elegantly** — and they're the
  same thing that makes it accessible and voice-ready. One investment, three payoffs.

## Competitive UX references (surfaced in research — worth a closer look)
Direct/adjacent products doing pieces of this: **Sheer Health** (upload a photo/PDF of a bill → checks
charges vs benefits), **Goodbill** (upload records → review flow), **Counterforce Health** (appeals),
and **Cleo** (chat-first money app rendering inline paycheck/spending breakdown cards — the closest
"chat + inline financial cards" exemplar). General exemplars: **Claude** (doc chip + Artifacts side
panel), **NotebookLM** (cite→source), **Typeform** (conversational forms), Epic **"Ask Emmie"**
(healthcare intake). _Flag: these are competitors as well as references — worth a dedicated competitive
pass (the existing brief only covers Granted Health)._

## Voice (fast-follow, not V0.1)
Because every card has a text-equivalent, the verdicts/amounts/actions are already speakable. Voice
becomes a rendering+capture layer over the same agent + fallbacks; defer the actual voice build.

## The empty state / discoverability (a named chat-first failure)
The blank chat box is **intimidating and low-discoverability** ("a blank canvas assumes everyone knows
how to translate intent into a prompt"; the empty box "didn't feel neutral — it felt intimidating").
A chat-first product must **state its capabilities and offer entry points**, not a bare textbox. Our
empty state should present **a few concrete starts** that match the common path: *"📄 Upload a bill or
statement," "✉ Forward a billing email," "💬 Ask about a charge," "🗂 Set up a home for your bills."*
This is also where we set expectations (what we do / that it's information, not legal advice).

## Pitfalls to avoid (straight from the research)
- **The conversation trap** — don't force typing for known/structured input; offer the card/tap.
- **The blank-canvas problem** — never ship a bare textbox; lead with capabilities + suggested starts.
- **False-authority of a styled number** — a polished card can make a wrong number look authoritative;
  our **bright line** (numbers only from deterministic sources) is the structural defense, but copy
  should still show provenance ("from your EOB" / "per the itemized bill").
- **Approval fatigue** — risk-tier confirmations; don't gate safe actions (over-confirming → rubber-stamping;
  under-confirming → dangerous auto-actions). Match the bright-line/eval stance on external actions.
- **Generated-UI inaccessibility & layout instability** — owned catalog + reserved space + live regions.
- **Over-clever cards** — when plain text is clearer (nuanced advice, empathy), use text. Cards are for
  verdicts, amounts, facts, and actions; the *advice* stays conversational. Use **skeletons, not spinners**.
- **No human escape hatch** — the most-cited chatbot failure. Always offer a way to reach a person /
  get expert help, especially on high-stakes or low-confidence calls (ties to the Q7 disclaimer posture).

## Research basis (mid-2026, cited in the sub-briefs)
Generative UI / tooling: **Vercel AI SDK** generative UI + **`needsApproval`** HITL, **Google A2UI** (Dec
2025, trusted-component-catalog model), **Thesys C1**, **CopilotKit/AG-UI**, **assistant-ui**, **shadcn/ui**.
Patterns/specs: **WCAG 1.4.1 / 2.5.8 / 4.1.3**, IBM **Carbon** / Shopify **Polaris** / **Atlassian** /
Vercel **Geist** (status/badge semantics), **Stripe/Wise** receipts + **Baymard/NN-g** "no surprise total"
+ tabular figures, **Ant Design** timeline + **NN/g** status-tracker guidelines, **Apple HIG/Material**
touch targets + thumb-zone, **Smashing** (May 2026) streaming-stability, **MDN/W3C/TetraLogical** ARIA live
regions, **Frontend Masters/OverlayQA** generated-UI-inaccessibility. Exemplars: Claude (doc chip +
Artifacts), NotebookLM (cite→source 3-panel), Typeform (conversational forms), Epic "Ask Emmie"
(healthcare intake), Gemini/Claude Code/Cursor (confirm-before-action). _Caveat: research-agent fetches
were 403-limited; treat single-snippet specifics as verify-before-citing._

## Open questions
- How much of the catalog do we build first vs. stub as text? (→ the 80/20 card cut, Q6) — build only the most-expected cards (VerdictCard + AmountsPanel), grow from there.
- Side-panel (web) vs full-screen (mobile) document viewer — one responsive component or two?
- Do we adopt the AI SDK generative-UI pattern directly, or a thin in-house tool→component renderer?
