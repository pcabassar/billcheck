# Competitive & inline-UI landscape (mid-2026)

> **Status: INPUT (V0.1).** Market scan from the Q4 UX research run. Complements the V0-era brief
> (which only covered Granted Health). Entry: [../START-HERE.md](../START-HERE.md). _2026-06-17._
> _Sourcing caveat: research-agent web fetches were 403-limited; most UI specifics are from
> search-surfaced/press content, not first-hand screenshots — verify live before quoting._

## The headline: chat-first bill *triage* is greenfield
The category splits into two interaction models, and **neither is a chat-first consumer bill advisor**:
1. **Upload → AI result** (the bill-checkers, appeal tools).
2. **Forms → human advocate** (the negotiation services).

Conversational UIs exist only in **adjacent benefits navigation** (Healthee, Nayya), not bill triage.
**Critically: no current product front-loads "is this a statement or a bill?"** — the exact comprehension
problem (EOB-vs-bill, "this is not a bill") that our #1 verdict targets. **This is the white space**, and
it lines up precisely with Pedro's hypothesis that our top two jobs are "don't pay yet, that's a
statement" and "this looks fine, pay it."

## Competitors — medical bill space
**Appeal / claim-denial (upload → AI appeal letter):**
- **Counterforce Health** — leading, **free** (grant-funded), AI appeal-letter generation + a voice agent
  ("Maxwell") that calls insurers. NOT chat. Claims ~70% success, ~20k helped. Positions *against* general
  chatbots (PHI/appeal refusal). [counterforcehealth.org](https://www.counterforcehealth.org/)
- **Claimable** — **$39.95/appeal**, structured intake → letter (fax/mail, 72-hr urgent); scoped to ~60
  denied treatments; **pivoting B2B/enterprise** (Apr 2026). [getclaimable.com](https://www.getclaimable.com/)

**Negotiation / error-detection (upload itemized bill → flags → negotiate):**
- **Goodbill** — coding audit (duplicates/upcoding/**unbundling/NCCI**, CPT/HCPCS-keyed) → negotiation
  letter + follow-up; charity-care check. **Success fee 20% of savings, capped $1k**; hospital bills only,
  nothing in collections. [goodbill.com/patients](https://www.goodbill.com/patients)
- **Resolve Medical Bills** — human-advocate concierge; tiered **deposit + 25%/10% success fee**. The
  incumbent human model the AI tools undercut. [resolvemedicalbills.com](https://www.resolvemedicalbills.com/how-we-work)

**The 2025/26 AI bill-checker wave (upload → verdict-teaser → paywall; NOT conversational):**
- **BillAudit AI** — **54 checks vs live 2026 CMS DBs** (Medicare fee schedule, NCCI, MUE, ICD-10); free
  scan shows error count → $9 report → **$49 "Action Kit" (dispute letters + phone scripts)**. The sharpest
  "free teaser verdict card" model. [billauditai.com](https://billauditai.com/)
- **OrbDoc** (free, client-side, review codes before analysis), **BillSight** ("dispute letter in 60s" +
  25%-savings human follow-up), **BillMeLess**, **Reassure Health** (notably ingests **bill + policy + EOB**
  → bill-vs-policy analysis + appeal drafts). Existence search-confirmed; longevity unverified.

**Charity / financial aid:** **Dollar For** — best **guided-flow** UX: 6-question screener vs 8,630+
hospital policies → auto-fills the application; case-tracking portal; free; ~$151M relieved. [dollarfor.org](https://dollarfor.org/what-we-do/)

**Benefits navigation (chat, but B2B2C, not bill triage):** **Healthee** ("Zoe," 50+ langs), **Nayya**
(agentic; files claims / auto-appeals inside Slack/Teams/Claude). Best conversational-benefits references.

**EOB comprehension (the closest to our #1):** **Cedar** — the strongest reference: plain-language
translation of codes ("Insurance covered $100 of your $156 visit because you've met your deductible…
remaining balance $56"), **payer logo next to the balance to signal "EOB and bill match, this is real,"**
shows EOB alongside the bill. "Cedar Intelligence" AI expanded Apr 2026. (Provider-side distribution.)
[cedar.com](https://www.cedar.com/) · **Sidecar Health** — upfront "price tag" instead of an EOB. ·
**FAIR Health Consumer** — free CPT-level cost benchmarking. [fairhealthconsumer.org](https://www.fairhealthconsumer.org/)

**Regulatory note:** from **Jan 1 2026** some payers stop mailing EOBs by default (portal-only) → raises
the value of a tool that ingests a photographed/digital EOB and explains it.

## Transferable UI vocabulary (who to study)
- **Cleo** — the key chat-first comparable: texts like a friend; renders in-chat **coin-stack money
  breakdowns**, category cards, budget bars; signature **"roast/hype" verdict tone** users love (4.7★,
  223k ratings). [meetcleo.com](https://web.meetcleo.com/)
- **Copilot Money** — best **color-coded verdict cards** (green on-track / yellow trending-over / red over).
- **Cedar** — plain-language EOB→owe translation + **trust signal** (payer logo, "verified").
- **Perplexity** — consumer exemplar of **typed inline cards/charts** in answers.
- **Klarna assistant / BofA "Erica"** — **conversational card + one-tap action** (refund, card-lock, cancel).
- **BillAudit** — the **free "we found N errors / $X potential savings" teaser** hero card.
- **Monarch / Origin "Sidekick"** — NL Q&A over personal data with grounded answers + "we don't train on
  your data" trust copy; Sidekick is an **SEC-regulated** AI advisor (a regulatory-posture reference).

## Inline-UI architectures (for our build — see [../v0.1-design/04-chat-ux.md](../v0.1-design/04-chat-ux.md))
Three patterns by 2026: (1) **developer widgets in sandboxed iframes** (OpenAI Apps SDK); (2) **fully
model-generated UI** (Gemini Dynamic View, Claude Artifacts, v0); (3) **native typed cards from a fixed
catalog** (Perplexity, Raycast). For a healthcare bill advisor, **pattern 3 (owned, accessible typed
cards from structured tool output)** is the proven, safe consumer choice — model-generated UI is the
accessibility + trust risk we can least afford. **MCP Apps** (Anthropic+OpenAI, released Jan 26 2026) is
the emerging cross-host standard if we later embed inside ChatGPT/Claude — a distribution channel, not a
V0.1 dependency.

## Differentiation thesis
**Combine** what's currently scattered: conversational **triage** ("is this even a bill?") + **Cedar-style
plain-language EOB/billed-vs-owe breakdown** + **code-level itemization verdict** (our engine's home turf)
+ **cost benchmarking** (FAIR-Health-style) + **one-tap appeal/dispute-letter + phone-script** generation —
all in **one chat-first advisor that works for anyone with no integration**. No one ships the *triage-first*
front door; that, plus the persistent-advocate campaign engine, is the wedge.

## Follow-ups
- A dedicated competitive deep-dive (pricing, distribution, moats) — this is a scan, not the full study.
- Pricing-model question: free/grant (Counterforce) vs flat-fee (Claimable $39.95) vs success-fee
  (Goodbill 20%/$1k, Rocket 35–60%) — informs our model later.
- First-hand UX teardown of Cleo + Cedar (the two closest references) before we design our cards.
