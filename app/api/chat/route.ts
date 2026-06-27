import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { TOOL_NOTE, buildStateBlock } from "@/lib/case/state";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { logError } from "@/lib/log";
import {
  listOtherOpenCases,
  loadCaseContext,
  persistTranscript,
  resolveActiveCase,
} from "@/lib/db/cases";
import { upsertDocumentsFromMessage } from "@/lib/db/documents";
import { makeTools } from "@/lib/tools";

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
    // Record any docs attached to THIS turn as case-scoped rows (deduped by blobUrl)
    // before the model reads them — so the case is the authoritative blob index.
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      await upsertDocumentsFromMessage(tx, userId, activeCase.id, lastUserMessage);
    }
    const ctx = await loadCaseContext(tx, userId, activeCase.id);
    // U11: light cross-case awareness — the user's OTHER open cases by TITLE/STATUS only
    // (never their contents). The model gets aware-of, not access-to; tools bind the active case.
    const otherCases = await listOtherOpenCases(tx, userId, activeCase.id);
    return { caseId: activeCase.id, stateBlock: buildStateBlock(ctx, otherCases) };
  });

  const inlined = await inlineOwnedBlobs(messages, userId);

  // Prompt caching (Anthropic ephemeral breakpoints, passed THROUGH the AI Gateway):
  //   - `@ai-sdk/gateway@3.0.134` has NO `caching` input option (the old `gateway:{caching:'auto'}`
  //     was a silent no-op), so we set the supported breakpoints directly.
  //   - The SYSTEM message is the largest stable prefix (frozen prompt + tool note + state block) →
  //     mark it cacheable as a leading system ModelMessage carrying providerOptions.anthropic.
  //   - The LAST inlined document/file part is the next-largest stable content → mark it too.
  // Anthropic caches the prefix UP TO each breakpoint; repeat turns should then report
  // cacheReadTokens > 0 (logged in onFinish). If it stays 0 in production, switch to the direct
  // `@ai-sdk/anthropic` provider (the Gateway passthrough is the suspect, not these breakpoints).
  const cacheControl = { anthropic: { cacheControl: { type: "ephemeral" } } } as const;

  const systemMessage: ModelMessage = {
    role: "system",
    // 3-part prompt: frozen advice prose + tool note (U4) + per-turn case state.
    content: SYSTEM_PROMPT + "\n\n" + TOOL_NOTE + "\n\n" + stateBlock,
    providerOptions: cacheControl,
  };

  const converted = await convertToModelMessages(inlined);
  // Attach a cache breakpoint to the LAST file part across the converted messages (the largest
  // stable document content). Mutating in place is fine — `converted` is freshly built here.
  for (let i = converted.length - 1; i >= 0; i--) {
    const content = converted[i].content;
    if (!Array.isArray(content)) continue;
    const lastFile = [...content].reverse().find((p) => p.type === "file");
    if (lastFile) {
      lastFile.providerOptions = cacheControl;
      break;
    }
  }

  const result = streamText({
    // AI Gateway "provider/model" string — routed via AI_GATEWAY_API_KEY.
    model: "anthropic/claude-opus-4.8",
    // System prompt is carried as a leading ModelMessage so it can hold the cache breakpoint.
    messages: [systemMessage, ...converted],
    // Our system content is first-party (frozen prompt + tool note + state), not user input — the
    // system-in-messages prompt-injection warning is a false positive here, so suppress it.
    allowSystemInMessages: true,
    // U4: the deterministic capability surface — every tool runs under RLS on the active case.
    tools: makeTools(userId, caseId),
    // Allow a few tool steps within one turn.
    stopWhen: stepCountIs(8),
    maxOutputTokens: 16000,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Persist the full UIMessage[] (incl. the assistant turn) once the stream finishes.
    onFinish: async ({ messages: all }) => {
      await withUser(userId, (tx) => persistTranscript(tx, userId, caseId, all));

      // Verifiable cache stat (non-sensitive: token COUNTS only — no message/bill content). On a
      // repeat turn cacheReadTokens should be > 0; if it stays 0 in production, switch to the direct
      // `@ai-sdk/anthropic` provider (see the breakpoint comment above). Field names verified against
      // the installed ai@6 LanguageModelUsage type: inputTokenDetails.{cacheReadTokens,cacheWriteTokens}.
      // Usage lives on the streamText result (the UIMessageStream onFinish arg carries no usage).
      try {
        const usage = await result.totalUsage;
        const d = usage.inputTokenDetails;
        console.log(
          `[chat:cache] cacheRead=${d?.cacheReadTokens ?? 0} cacheWrite=${d?.cacheWriteTokens ?? 0} input=${usage.inputTokens ?? 0}`,
        );
      } catch (err) {
        logError("chat:onFinish:usage", err);
      }
    },
    // U12: do NOT echo raw internal error text to the client — an error message can carry a bill
    // amount, a document detail, or an echoed model error. Log a redacted line server-side and
    // return a generic, friendly message.
    onError: (error) => {
      logError("chat:onError", error);
      return "Something went wrong on our end — please try again.";
    },
  });
}
