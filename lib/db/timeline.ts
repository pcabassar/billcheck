// Timeline read access (U10 case workspace). EVERY function takes a `DbTx` from `withUser(...)`
// and therefore runs under RLS as that user — a forgotten WHERE is structurally harmless, but
// we still scope by userId/caseId for clarity and correct row selection.
//
// Timeline events are WRITTEN elsewhere (artifacts.ts, the reminder Workflow); this is the
// read surface the case workspace renders. Known event `type` values in v1:
//   artifact_generated, artifact_sent, reminder_sent, reminder_suppressed,
//   reminder_failed, reminder_cancelled.
import { and, desc, eq } from 'drizzle-orm'
import type { DbTx } from './index'
import { timelineEvents } from './schema'

export type TimelineEventRow = typeof timelineEvents.$inferSelect

/** All timeline events for a case (owned), most-recent first. */
export async function listTimeline(
  tx: DbTx,
  userId: string,
  caseId: string,
): Promise<TimelineEventRow[]> {
  return tx
    .select()
    .from(timelineEvents)
    .where(and(eq(timelineEvents.userId, userId), eq(timelineEvents.caseId, caseId)))
    .orderBy(desc(timelineEvents.createdAt))
}
