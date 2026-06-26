import type { UIMessage } from "ai";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { loadActiveTranscript, resolveActiveCase } from "@/lib/db/cases";

// Resume a case on the client: returns the case id + its stored transcript so useChat can be
// seeded. With no `?caseId=`, resolves the most-recently-updated case (mount/resume). With a
// `?caseId=`, loads THAT case (the case switcher) — an unowned id falls through to the most-recent
// under resolveActiveCase, so switching can never load another tenant's transcript.
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return new Response("Unauthorized", { status: 401 });
    throw e;
  }

  const requestedCaseId =
    new URL(req.url).searchParams.get("caseId") ?? undefined;

  const { caseId, messages } = await withUser(userId, async (tx) => {
    const activeCase = await resolveActiveCase(tx, userId, requestedCaseId);
    const transcript = await loadActiveTranscript(tx, activeCase.id);
    return {
      caseId: activeCase.id,
      messages: (transcript?.messages ?? []) as UIMessage[],
    };
  });

  // userId is returned so the client can namespace uploads as `user/<userId>/<file>`
  // (the upload route enforces this prefix server-side).
  return Response.json({ userId, caseId, messages });
}
