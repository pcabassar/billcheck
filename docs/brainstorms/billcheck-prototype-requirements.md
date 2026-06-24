---
date: 2026-06-24
topic: billcheck-prototype
---

# billcheck — the prototype (a gap-discovery instrument)

## Summary

A from-scratch, chat-first medical-bill advisor built to establish the general-model baseline and expose where it falls short — its real output is an observed list of gaps that becomes the build roadmap. The minimal version is a single-conversation chat that reads the user's actual documents (PDF/image) and gives grounded, conservative triage from a simple orchestrator prompt.

---

## Problem Frame

People routinely can't tell what a medical document is or what to do with it — whether a paper is a statement or a final bill, whether an EOB means they owe anything, whether a charge is worth questioning. Guessing wrong is asymmetric: paying a bill that wasn't owed (or wasn't final) loses real money, while the confusion itself drives people to ignore bills, overpay, or burn hours on hold. Today they cope by asking a general AI, calling the billing office, or doing nothing — and a general model, with no document in hand and no medical-billing posture, gives generic answers and will confidently mislead on the cases that matter most. We don't actually know how far a strong model gets at this when it can *see* the document; the prototype exists to find out honestly, and to show exactly where it stops being good enough.

---

## Actors

- A1. User: a person with a medical bill, statement, or EOB who wants to know what it is and what to do.
- A2. Orchestrator: the AI advisor that reads the user's documents, reasons about the situation, and gives grounded, conservative guidance.

---

## Key Flows

- F1. Helping the user with a bill
  - **Trigger:** the user shares a document or describes their situation, and may add more over the conversation.
  - **Actors:** A1, A2
  - **Steps:** the orchestrator helps — working from what the user actually shows, asking for whatever it needs, and giving its read plus a next step when it can. *How* it gets there is the model's to decide.
  - **Outcome:** the user gets useful, safe guidance — or the most useful next question.
  - **Covered by:** R1, R2

---

## Requirements

- R1. The product is a single chat conversation; the user can send text and attach documents (PDF and image), which the orchestrator reads directly.
- R2. The orchestrator's core job is to help the user manage their medical bills in the best way possible; it decides what to ask and leads with the user's actual situation. (Seed prompt: a medical-billing expert who helps the user, bases help on what the user actually shows, and says so / asks when unsure.)

---

## Success Criteria

- The prototype gives useful, safe triage at roughly general-model quality on real documents — verified hands-on against Pedro's own bills/EOBs plus the hardest documented cases (statement-mistaken-for-bill, looks-fine-but-isn't).
- It yields a concrete, observed list of failure modes across the four gaps (safety/conservatism, situation knowledge, memory across bills, effort/UX) — enough to justify and prioritize what to build next.
- It does not produce a dangerous "pay it" on the known-bad safety-check cases.
- A planner can build it from this doc without inventing product behavior, and treats the prototype as deliberately stateless.

---

## Scope Boundaries

### Deferred for later (the gaps the prototype will map)

- Persistence, accounts, and a multi-bill "home for your medical bills" — including reasoning across cases. Built when memory is the next thing, designed from what the prototype teaches; **case/bill/EOB stays a conceptual frame until then, not a schema.**
- A cited knowledge base for situation-specific levers (ACA preventive $0, No Surprises Act, QMB $0, charity care, FDCPA deadlines).
- Richer UX: a fuller card set, guided flows — anything that lowers user effort beyond plain chat.
- Connecting to insurance/hospital portals or payer APIs — accelerants, never dependencies.
- Web research / live source lookup as a tool.

### Outside this product's identity

- A billing-office / provider-side revenue tool — billcheck is the patient's advocate.
- A general health-benefits navigator or symptom/clinical adviser — it's about bills.
- A thin "paste it into a general chatbot" wrapper — the product's reason to exist is closing the gaps a general model leaves open.

---

## Key Decisions

- **Prototype is a gap-discovery instrument, not a v1.** Success is a baseline + an honest gap list, explicitly not "good enough to ship." It's the cheapest way to learn what's worth building, and it grounds the roadmap in observation instead of guesses.
- **Stateless, no database.** The single conversation holds everything in context. Zero schema commitment is the least-cornering choice; the real schema is designed when persistence is built. (If sessions are saved to study failures, that's a flat transcript log, not the case model.)
- **Safety lives in the prompt, not a gate.** "Base help on what's shown; when unsure, say so and ask," plus the stakes-scaled bar — a careful posture beats hard machinery before there are real users.
- **Tools and cards are optional, never mandated; no fixed verdict taxonomy.** A few cards won't cover every case, and forcing structure makes the model jam situations into shapes that don't fit.

---

## Dependencies / Assumptions

- Stack: Next.js + Vercel AI SDK (chat + file attachment), assumed appropriate for a minimal chat.
- The chosen model reads PDFs and images natively, so no separate document-parsing tool is needed for the prototype.
- First users are Pedro (and possibly a few friends/family) on their own or synthetic bills — no external or at-risk users, so no PHI/compliance machinery yet.
- `docs/initial-research/` is supporting evidence (the 31 cases, taxonomy, competitive scan, chat-UX and intake brainstorm notes) — inputs, not a plan.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] Exact latest Claude model id and how it's wired through the Vercel AI SDK (gateway vs. direct provider) — verify against live docs at plan time.
- [Affects R2][User decision · low-stakes] How conservative the "pay it" bar should feel in practice — calibrate by watching the prototype, not up front.
- [Affects R1][Technical] Upload handling — which file types/sizes the model accepts inline — confirm at plan time.
