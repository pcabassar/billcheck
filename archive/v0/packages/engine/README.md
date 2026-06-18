# @billcheck/engine

The deterministic audit engine (arch D2). Pure functions over typed inputs +
an injected, versioned reference snapshot. **No UI, auth, network, or DB
imports.** No LLM output can create, suppress, or rescore a finding from
inside the engine — document text is untrusted data and never reaches here.

## What it does

`runEngine(input, refs)` runs every check, returns `{ engineVersion,
checkVersions, findings, coverage }`. `routeVerdict({ itemized, flags,
findings, coverage })` turns that into a primary verdict + deadline-ordered
stacked tracks (the D10 router).

### Checks (V0 battery)

| Check | What | Tier | Amount |
|---|---|---|---|
| C1 | Balance billing: bill total vs EOB patient-responsibility | high | overage |
| C2 | Insurance never billed (insured + no EOB + no adjustments) | review | null |
| C3 | Duplicate charges (same code/date/doc) | high | dup amount |
| C4 | NCCI unbundled pairs | high | component charge |
| C5 | MUE units exceeded | high | excess × per-unit |
| C6 | CARC provider-writeoff codes on the EOB | high | adjustment |
| C8 | GFE breach (> $400 over the estimate) | high | overage |
| C9 | FAP eligibility (income band vs published thresholds) | medium/review | null |
| C10 | Medicare-multiple **anchor** (≥4×) — never an "error" | medium | **null** |
| C13 | Payments not credited (receipts vs bill credits) | high | uncredited |

C7/C11/C12 are V1 (records-based / LLM judgment) — they report
`not_yet_available` on the coverage map, never silent absence.

### Honesty contracts (load-bearing — tests enforce them)

- **C10 and C9 carry `amountImpactCents: null`** — they are leverage, not
  dollars owed. Asserting a recovery amount would be phantom savings.
- **PAY requires** an itemized bill AND C3/C4/C5/C10 all `ran` AND zero
  findings. A partial battery that finds nothing routes to `CLEAN_PARTIAL`
  ("no issues in the N checks we could run"), never PAY.
- **Summary bills route to GET_ITEMIZED**, never PAY, regardless of findings.
- Every finding stamps the **per-table** reference version it used
  (`refVersions`) — never a single conflated label.

## Reference data

Versioned, append-only snapshots (`ref_*` tables). The engine resolves the
latest version per table at run start (via `ref_versions`, by `loaded_at`)
and stamps each finding. Old findings stay reproducible forever because prior
versions are never mutated. Quarterly refresh: `scripts/refresh-reference.ts`
(insert-only, local files only — CMS gates automated fetch).

## Eval harness (`eval/`)

Golden fixtures: `eval/fixtures/<NNN-name>/{input.json, expected.json}`.
`input.json` carries the `EngineInput` plus its own `refs` snapshot;
`expected.json` carries `{ findings, coverage }` and optionally `{ verdict,
flags }` for end-to-end router assertions.

**Anti-circularity (review A5):** expected findings are computed BY HAND from
the reference tables, never captured from engine output. Each fixture's
arithmetic is simple enough to verify independently (e.g. C5 excess =
`(units − max) × (amount / units)`).

The matrix spans: duplicates, MUE, NCCI, paired facility/professional,
summary→GET_ITEMIZED, self-pay GFE→CONTEST, FAP→REDUCE, already-paid→REJECT,
collections→VALIDATE, clean→PAY, an **injection-resilience** case (adversarial
text in `descriptionRaw` that must NOT change findings — security #3), and a
**reproducibility** case (distinct per-table versions that must appear,
unconflated, in the finding's stamp — data #4 + F05).

### Adding a fixture

1. Create `eval/fixtures/<NNN-name>/input.json` with line items + a `refs`
   snapshot.
2. Compute `expected.json` by hand from the reference tables. Keep findings
   to 1–2 so the math is checkable.
3. Add `verdict` + `flags` to `expected.json` for an end-to-end assertion.
4. `pnpm --filter @billcheck/engine eval` — CI gates on this.

## Commands

```
pnpm --filter @billcheck/engine test   # unit tests (checks + router)
pnpm --filter @billcheck/engine eval   # golden fixtures (CI gate)
```
