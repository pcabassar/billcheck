# UI test 04 — Unsupported file type

**Did:** injected a `.txt` file (`text/plain`) into the file input.
**Result:** ✅ Rejected client-side: error chip *"random-notes.txt — unsupported / failed"*, and the send button stayed disabled (no text, no valid attachment). The bad file never uploaded. Correct validation UX; the user can clear it with the ✕.
