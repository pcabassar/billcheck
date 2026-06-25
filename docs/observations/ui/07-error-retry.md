# UI test 07 — Error + retry

**Did:** forced the next `/api/chat` call to return HTTP 500 (one-shot client-side `fetch` intercept, then restored), sent a message, then clicked **"Try again."**
**Result:** ✅ The error bubble appeared (*"Something went wrong — I didn't finish. Try again"*). Clicking retry (with fetch restored) re-ran via `regenerate()` and recovered with a real streamed reply. The error + retry path works end-to-end.
