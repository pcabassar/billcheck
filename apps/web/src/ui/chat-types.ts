// The chat message type for the Vercel AI SDK transport. One custom data part, "turn",
// carries the agent's rendered Part[] (text + sourced cards) and the case status. Cards still
// come only from tool facts — the SDK is the transport, not the source of the numbers.
import type { UIMessage } from "ai";
import type { Part } from "../core/types";

export interface TurnData {
  parts: Part[];
  status: string;
}

export type BillcheckUIMessage = UIMessage<unknown, { turn: TurnData }>;
