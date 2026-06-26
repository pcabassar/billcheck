// POST /api/cases/[id]/resolve — the workspace "Mark resolved" action. KEEPS PARITY with the
// markResolved tool (lib/tools/index.ts): set status 'resolved', close every open reminder, then
// run the deterministic consent-gated aggregate write. Same db helpers + closeReminder + the U9
// recordCaseAggregate the tool calls — so the button and the agent do the identical thing.
import { withUser } from '@/lib/db'
import { setCaseStatus, type CaseStatus } from '@/lib/db/cases'
import { listDeadlines } from '@/lib/db/deadlines'
import { closeReminder } from '@/lib/workflows/reminder-control'
import { recordCaseAggregate } from '@/lib/db/aggregate'
import { resolveUser } from '@/lib/route-auth'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id: caseId } = await params

  try {
    // 1) Set status + collect open deadlines to close (one RLS-scoped tx).
    //    listDeadlines reads the user's rows; an unowned caseId simply returns none.
    const openDeadlines = await withUser(userId, async (tx) => {
      await setCaseStatus(tx, caseId, 'resolved' as CaseStatus)
      const all = await listDeadlines(tx, userId, caseId)
      return all.filter((d) => d.status === 'open')
    })

    // 2) Close each open reminder (best-effort, outside the tx).
    for (const d of openDeadlines) {
      await closeReminder(caseId, d.id, d.workflowRunId)
    }

    // 3) Deterministic, consent-gated aggregate write (self-checks consent — admin client).
    const agg = await recordCaseAggregate(caseId, userId)

    return Response.json({ ok: true, status: 'resolved', aggregateRecorded: agg.written })
  } catch {
    return new Response('Could not mark the case resolved.', { status: 500 })
  }
}
