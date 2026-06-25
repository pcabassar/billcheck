# UI test 06 — Multi-turn with a document

**Path:** turn 1 uploads a doc; turn 2 is text-only — tests that the route re-inlines the prior private blob each turn and the thread holds context.
**Did:** turn 1 uploaded an EOB PDF ("THIS IS NOT A BILL", patient responsibility $0.00) — *"What even is it?"*; turn 2 (text only) — *"ok but should I call anyone, just to be safe?"*
**Result:** ✅ Turn 1: *"you owe nothing on this… 'THIS IS NOT A BILL' means no one is asking you for money."* Turn 2 referenced the prior EOB: *"a $0 EOB means everything's settled… keep this EOB as proof you owe $0… compare any later bill to it."* Confirms the route re-fetches+inlines the earlier blob on follow-ups and context is maintained.
