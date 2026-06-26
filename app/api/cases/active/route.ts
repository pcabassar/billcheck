import { validateUIMessages, type UIMessage } from "ai";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { loadActiveTranscript, resolveActiveCase } from "@/lib/db/cases";
import { makeTools } from "@/lib/tools";
import { logError } from "@/lib/log";

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

  const { caseId, messages: stored } = await withUser(userId, async (tx) => {
    const activeCase = await resolveActiveCase(tx, userId, requestedCaseId);
    const transcript = await loadActiveTranscript(tx, activeCase.id);
    return {
      caseId: activeCase.id,
      messages: (transcript?.messages ?? []) as UIMessage[],
    };
  });

  // A transcript persisted mid-tool-turn can have dangling/non-terminal parts that would break
  // useChat on resume. Validate (and normalize) against the SAME tool set the chat route uses, so
  // the loaded list is coherent before it seeds the client. If validation throws on bad data, fall
  // back to a clean session ([]) rather than 500 — a corrupt transcript shouldn't block resume.
  let messages: UIMessage[] = [];
  try {
    // `validateUIMessages` types `tools` with invariant per-tool generics keyed off the message's
    // UITools; our concrete heterogeneous `makeTools` map (each tool has distinct input/output)
    // doesn't structurally satisfy that index signature even though it's the right runtime value.
    // The chat route passes the SAME map to streamText (a ToolSet) without issue; here we cast to
    // the parameter type so the tool-call STRUCTURE is still validated. Runtime behavior unchanged.
    messages = await validateUIMessages({
      messages: stored,
      tools: makeTools(userId, caseId) as unknown as Parameters<
        typeof validateUIMessages
      >[0]["tools"],
    });
  } catch (err) {
    logError("cases:active:validateUIMessages", err);
    messages = [];
  }

  // userId is returned so the client can namespace uploads as `user/<userId>/<file>`
  // (the upload route enforces this prefix server-side).
  return Response.json({ userId, caseId, messages });
}
