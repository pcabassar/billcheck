# UI test 01 — PDF statement upload + render

**Path:** real file input → private Blob → route fetch-inline → Opus → markdown render.
**Did:** injected a synthetic "summary statement" PDF (AMOUNT DUE $1,240, "this is a summary statement, not an itemized bill"); asked *"I got this in the mail. Do I actually owe the $1,240?"*
**Result:** ✅ Chip rendered in the composer and in the sent user message. Reply read the PDF: *"I can't tell yet… it even says 'this is a summary statement, not an itemized bill'… so don't pay it yet,"* then asked for insurance/EOB. Safe + correct.
**Bug found + fixed:** assistant replies rendered with large blank vertical gaps — `.bubble` set `white-space:pre-wrap` (right for the user's plain text, wrong for rendered markdown, where it turns inter-element newlines into blank lines). Scoped pre-wrap to user bubbles. (commit `fb8e86d`)
