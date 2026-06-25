# billcheck prototype — test observations

A tester's log: simulating real users across the [31 documented cases](../initial-research/cases/index.md)
against the **live prototype** (Opus 4.8 + the shipped [SYSTEM_PROMPT](../../lib/prompt.ts), documents
inlined exactly as the chat route does). Goal: establish the baseline and surface the **gap list** —
what a great advocate would do that the prototype doesn't.

## Method
- I play the **user-simulator** (a realistic, non-expert opening message per case + persona, with a
  synthetic bill/EOB/statement where the case hinges on a document) and the **grader** (the assessment).
- Harness: [`scripts/probe.mjs`](../../scripts/probe.mjs) runs each case's turns through the real model +
  prompt path. Raw transcripts in [`_raw/`](_raw/); one observation file per case alongside.
- Each observation scores: **recognition · safety (no premature "pay it") · usefulness · levers · next-step**,
  then lists **gaps** vs. the case's ideal play.

## Cases tested
- Seed cases (deep, journalism-sourced):
  - [seed-01 — duplicate facility fee](seed-01-duplicate-facility-fee.md)
  - [seed-02 — OON ambulance balance bill](seed-02-oon-ambulance.md)
  - [seed-03 — Two Chairs misrepresentation](seed-03-two-chairs-misrepresentation.md)

_See [SUMMARY.md](SUMMARY.md) (written after the run) for learnings + recommendations._
