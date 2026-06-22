// The chat endpoint, now speaking the Vercel AI SDK UI-message-stream protocol so the client
// runs on `useChat`. With a real key it runs the MODEL-DRIVEN loop (model calls the audit tool,
// owns the card; we log model# vs tool#); without one it runs the deterministic mock path
// (the offline harness path). The agent's turn is emitted as a single "data-turn" part — cards
// land at the end of the loop, so there's nothing to stream incrementally yet.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { GuardedClient, transportFromEnv } from "../../../src/core/model";
import { respond, type CaseInput } from "../../../src/core/agent";
import { respondWithModel } from "../../../src/core/agentModel";
import type { BillcheckUIMessage } from "../../../src/ui/chat-types";

export const dynamic = "force-dynamic";

interface IncomingMessage {
  role?: string;
  parts?: { type?: string; text?: string }[];
}

/** Prefer the structured CaseInput the client attaches (demo scenarios carry docs); otherwise
 *  derive a free-text input from the latest user message. */
function deriveInput(body: { input?: CaseInput; messages?: IncomingMessage[] }): CaseInput {
  if (body?.input && typeof body.input === "object" && Array.isArray(body.input.docs)) return body.input;
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      const text = (msgs[i].parts ?? [])
        .filter((p) => p?.type === "text")
        .map((p) => p?.text ?? "")
        .join(" ")
        .trim();
      return { docs: [], message: text || undefined };
    }
  }
  return { docs: [] };
}

export async function POST(req: Request) {
  let body: { input?: CaseInput; messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("bad_request", { status: 400 });
  }
  const input = deriveInput(body);

  const stream = createUIMessageStream<BillcheckUIMessage>({
    execute: async ({ writer }) => {
      try {
        let turn;
        if (process.env.ANTHROPIC_API_KEY) {
          turn = await respondWithModel(input);
        } else {
          const { transport, model } = transportFromEnv();
          const client = new GuardedClient({ transport, model, spendCapCents: 25, phaseOk: true });
          turn = await respond(client, input);
        }
        writer.write({ type: "data-turn", data: { parts: turn.parts, status: turn.status } });
      } catch {
        writer.write({
          type: "data-turn",
          data: { parts: [{ type: "text", text: "Something went wrong — please try again." }], status: "error" },
        });
      }
    },
    onError: (e) => (e instanceof Error ? e.name : "error"),
  });

  return createUIMessageStreamResponse({ stream });
}
