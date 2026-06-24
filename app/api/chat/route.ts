import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/prompt";

// Allow generous streaming time for document-reading replies.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    // AI Gateway "provider/model" string — routed via AI_GATEWAY_API_KEY.
    // TEMP: free-tier Haiku to unblock the build. Swap to "anthropic/claude-opus-4.8"
    // once the gateway is topped up (one string), before the real capability test.
    model: "anthropic/claude-haiku-4.5",
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 16000,
  });

  return result.toUIMessageStreamResponse({
    // Surface a readable error instead of the masked generic message.
    onError: (error) =>
      error instanceof Error ? error.message : "Something went wrong.",
  });
}
