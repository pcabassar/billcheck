# UI test 05 — Stop mid-stream

**Did:** sent a long-answer prompt ("explain step by step how to appeal a denied claim"); clicked the stop (■) button shortly after streaming began.
**Result:** ✅ Stream aborted — the partial reply froze (119 chars, no further growth on re-check), and the composer reverted from stop (■) to the send button. `stop()` works as intended.
