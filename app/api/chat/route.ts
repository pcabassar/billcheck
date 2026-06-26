import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { TOOL_NOTE, buildStateBlock } from "@/lib/case/state";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { withUser } from "@/lib/db";
import {
  loadCaseContext,
  persistTranscript,
  resolveActiveCase,
} from "@/lib/db/cases";

// Allow generous streaming time for document-reading replies.
export const maxDuration = 60;

const PRIVATE_BLOB_HOST = ".private.blob.vercel-storage.com";

// A blob URL is OWNED by this user iff its pathname is namespaced `user/<userId>/...`
// (the upload route forces this prefix — see app/api/blob-upload/route.ts). This is the
// cross-tenant authorization boundary: never trust the client part.url for another user.
function isOwnedBlobUrl(url: string, userId: string): boolean {
  if (!url.includes(PRIVATE_BLOB_HOST)) return false;
  let pathname: string;
  try {
    pathname = new URL(url).pathname.replace(/^\/+/, "");
  } catch {
    return false;
  }
  return pathname.startsWith(`user/${userId}/`);
}

// Build owner-verified, inlined messages. Uploaded files live in a PRIVATE Blob store,
// so the model can't fetch their URLs — read each OWNED file's bytes server-side and inline
// them as a data URL. A file URL that is not owned is SKIPPED (surface nothing secret). A
// fetch that is not OK is NOT silently treated as read — the file part is replaced with a
// plain-text note so the model doesn't analyze a document it never saw.
async function inlineOwnedBlobs(
  messages: UIMessage[],
  userId: string,
): Promise<UIMessage[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return Promise.all(
    messages.map(async (m) => {
      const parts = await Promise.all(
        m.parts.map(async (part) => {
          if (part.type !== "file" || typeof part.url !== "string") return part;
          if (!part.url.includes(PRIVATE_BLOB_HOST)) return part; // public/data URL — leave as is

          // Not owned by this user → drop it (don't inline another tenant's blob).
          if (!isOwnedBlobUrl(part.url, userId)) {
            return {
              type: "text" as const,
              text: "[a document could not be read]",
            };
          }

          if (!token) {
            return { type: "text" as const, text: "[a document could not be read]" };
          }

          try {
            const res = await fetch(part.url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              return { type: "text" as const, text: "[a document could not be read]" };
            }
            const bytes = Buffer.from(await res.arrayBuffer());
            return {
              ...part,
              url: `data:${part.mediaType};base64,${bytes.toString("base64")}`,
            };
          } catch {
            return { type: "text" as const, text: "[a document could not be read]" };
          }
        }),
      );
      return { ...m, parts };
    }),
  );
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return new Response("Unauthorized", { status: 401 });
    throw e;
  }

  const { messages, caseId: requestedCaseId }: { messages: UIMessage[]; caseId?: string } =
    await req.json();

  // Resolve/create the active case, persist the incoming turn DETERMINISTICALLY (so the
  // user turn is saved even if the stream dies), then load the per-turn state block.
  const { caseId, stateBlock } = await withUser(userId, async (tx) => {
    const activeCase = await resolveActiveCase(tx, userId, requestedCaseId);
    await persistTranscript(tx, userId, activeCase.id, messages);
    const ctx = await loadCaseContext(tx, userId, activeCase.id);
    return { caseId: activeCase.id, stateBlock: buildStateBlock(ctx) };
  });

  const inlined = await inlineOwnedBlobs(messages, userId);

  const result = streamText({
    // AI Gateway "provider/model" string — routed via AI_GATEWAY_API_KEY.
    model: "anthropic/claude-opus-4.8",
    // 3-part prompt: frozen advice prose + tool note (U4) + per-turn case state.
    system: SYSTEM_PROMPT + "\n\n" + TOOL_NOTE + "\n\n" + stateBlock,
    messages: await convertToModelMessages(inlined),
    providerOptions: { gateway: { caching: "auto" } },
    maxOutputTokens: 16000,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Persist the full UIMessage[] (incl. the assistant turn) once the stream finishes.
    onFinish: async ({ messages: all }) => {
      await withUser(userId, (tx) => persistTranscript(tx, userId, caseId, all));
    },
    // Surface a readable error instead of the masked generic message.
    onError: (error) =>
      error instanceof Error ? error.message : "Something went wrong.",
  });
}
