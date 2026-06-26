import type { UIMessage } from "ai";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { loadActiveTranscript, resolveActiveCase } from "@/lib/db/cases";

// Resume the active case on the client: returns the active case id + its stored
// transcript so useChat can be seeded on mount.
export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return new Response("Unauthorized", { status: 401 });
    throw e;
  }

  const { caseId, messages } = await withUser(userId, async (tx) => {
    const activeCase = await resolveActiveCase(tx, userId);
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
