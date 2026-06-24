import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/prompt";

// Allow generous streaming time for document-reading replies.
export const maxDuration = 60;

// Uploaded files live in a PRIVATE Blob store, so the model can't fetch their
// URLs. Read each file's bytes server-side (with the store token) and inline
// them as a data URL, which convertToModelMessages passes to the model directly.
async function inlinePrivateBlobs(messages: UIMessage[]): Promise<UIMessage[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return messages;
  await Promise.all(
    messages.flatMap((m) =>
      m.parts.map(async (part) => {
        if (
          part.type === "file" &&
          typeof part.url === "string" &&
          part.url.includes(".private.blob.vercel-storage.com")
        ) {
          const res = await fetch(part.url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const bytes = Buffer.from(await res.arrayBuffer());
            part.url = `data:${part.mediaType};base64,${bytes.toString("base64")}`;
          }
        }
      }),
    ),
  );
  return messages;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    // AI Gateway "provider/model" string — routed via AI_GATEWAY_API_KEY.
    // TEMP: free-tier Haiku to unblock the build. Swap to "anthropic/claude-opus-4.8"
    // once the gateway is topped up (one string), before the real capability test.
    model: "anthropic/claude-haiku-4.5",
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(await inlinePrivateBlobs(messages)),
    maxOutputTokens: 16000,
  });

  return result.toUIMessageStreamResponse({
    // Surface a readable error instead of the masked generic message.
    onError: (error) =>
      error instanceof Error ? error.message : "Something went wrong.",
  });
}
