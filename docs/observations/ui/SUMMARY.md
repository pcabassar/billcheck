# Browser / integration test pass — summary

Drove the real UI at `localhost:3000` like a user — **real uploads through the file input** (via DataTransfer injection, the standard browser-automation path), covering every distinct UI/integration path the [reasoning harness](../SUMMARY.md) couldn't reach. The model reasoning was already tested per-case (31 cases); this pass tests the **UI + upload + render** layer that the harness bypassed.

## Result: pipeline solid; 2 real rendering bugs found + fixed

| Path | Result |
|---|---|
| PDF upload → Blob → route inline → render | ✅ [01](01-pdf-statement.md) |
| Image upload (vision) | ✅ [02](02-image-er-bill.md) |
| Multi-file (bill + EOB) | ✅ [03](03-multifile-bill-vs-eob.md) |
| Unsupported file type | ✅ rejected [04](04-unsupported-file.md) |
| Stop mid-stream | ✅ [05](05-stop-midstream.md) |
| Multi-turn + doc (blob re-inline) | ✅ [06](06-multiturn-context.md) |
| Error + retry | ✅ [07](07-error-retry.md) |

**Bugs found and fixed (both invisible to the text-only harness — they're rendering):**
1. **Markdown whitespace** — bot bubbles inherited `white-space:pre-wrap`, so the newlines react-markdown emits between block elements rendered as big blank gaps. Scoped pre-wrap to user bubbles. (`fb8e86d`)
2. **GFM tables not rendering** — the model emits billed/allowed/paid/owed comparison tables; react-markdown needs `remark-gfm`. Added it + mobile table CSS. (`b49682e`)

## Notes
- Real uploads hit the actual **private Blob store** and the route's fetch-inline path. **Image (vision)** and **multi-file** both work; **multi-turn** confirms the route re-inlines the prior blob on each follow-up.
- Reasoning in the real UI matched the harness findings (safe "don't pay yet," correct document reading), confirming **parity** between harness and live UI.
- **Not separately re-run:** all 31 case *contents* through the browser — the UI is case-invariant and reasoning was already covered per-case; a representative spread (statement, image bill, bill-vs-EOB, $0 EOB) was exercised here. The exhaustive 31-in-browser sweep can be run on request.
- **OCR caveat stands:** these synthetic docs (and the canvas PNG) are clean; real phone photos will be noisier.
