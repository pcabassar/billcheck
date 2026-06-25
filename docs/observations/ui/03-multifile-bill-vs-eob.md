# UI test 03 — Multi-file (bill + EOB together)

**Path:** two PDFs in one message → both fetched+inlined by the route → Opus reconciles.
**Did:** a $2,800 hospital bill PDF + an EOB PDF (allowed $1,100, paid $880, patient responsibility $220); *"I got a bill for $2,800 but my insurance paperwork says something different. Which one do I actually owe?"*
**Result:** ✅ Two chips rendered. Reply read both docs and correctly concluded *"you owe $220, not $2,800,"* explained the in-network balance-bill prohibition, and laid it out in a comparison **table**.
**Bug found + fixed:** the comparison table rendered as raw `| | Amount |` pipes — react-markdown doesn't do GFM tables without `remark-gfm`. Added the plugin + mobile-friendly table CSS (block + `overflow-x:auto`); now renders as a real bordered table. (commit `b49682e`)
