// The ONE guarded model client. Single entry point for any model call, with the
// guards baked in: spend cap, PHASE gate, PHI-safe ledger. Transport is pluggable:
// a deterministic MOCK (offline / no key) or the real Anthropic SDK (when a key
// exists). The model only ever produces PROSE — never numbers (those come from
// tool facts), so the client never returns values used as facts.

export interface ModelRequest {
  purpose: "chat" | "draft"; // coarse category for the ledger
  intent: string; // e.g. "why.hold" — the mock keys off this; the real model gets it as guidance
  vars?: Record<string, string>; // non-numeric substitutions only
  carriesPhi?: boolean; // does this call include document/PHI content?
  /** real-model only: the system prompt + assembled user prompt (both ignored by the mock) */
  system?: string;
  prompt?: string;
}

export interface ModelResponse {
  text: string;
}

export interface LedgerRow {
  ts: number;
  purpose: string;
  intent: string;
  model: string;
  costCentsEst: number;
  ok: boolean;
  err?: string; // error *type*, never content/PHI
}

export class SpendCapError extends Error {}
export class PhaseGateError extends Error {}

export type Transport = (req: ModelRequest, model: string) => Promise<ModelResponse>;

export interface GuardedClientOpts {
  transport: Transport;
  model: string;
  spendCapCents: number;
  phaseOk: boolean; // false ⇒ PHI-bearing calls fail closed (pre-BAA boundary)
  costPerCallCents?: number; // rough estimate per call for the cap
  ledger?: LedgerRow[]; // injected sink (in-memory by default)
  log?: (msg: string, meta: Record<string, string | number | boolean>) => void;
}

export class GuardedClient {
  private spentCents = 0;
  readonly ledger: LedgerRow[];
  private opts: GuardedClientOpts;
  constructor(opts: GuardedClientOpts) {
    this.opts = opts;
    this.ledger = opts.ledger ?? [];
  }

  async generate(req: ModelRequest): Promise<ModelResponse> {
    const cost = this.opts.costPerCallCents ?? 1;
    // PHASE gate: fail closed for PHI-bearing calls outside the allowed phase.
    if (req.carriesPhi && !this.opts.phaseOk) {
      this.record(req, cost, false, "PhaseGateError");
      throw new PhaseGateError("PHI-bearing model call blocked by PHASE gate");
    }
    // spend kill-switch: checked BEFORE bytes leave.
    if (this.spentCents + cost > this.opts.spendCapCents) {
      this.record(req, cost, false, "SpendCapError");
      throw new SpendCapError(
        `spend cap reached (${this.spentCents + cost}¢ > ${this.opts.spendCapCents}¢)`,
      );
    }
    try {
      const res = await this.opts.transport(req, this.opts.model);
      this.spentCents += cost;
      this.record(req, cost, true);
      return res;
    } catch (e) {
      this.record(req, cost, false, (e as Error)?.name ?? "Error");
      throw e;
    }
  }

  spent(): number {
    return this.spentCents;
  }

  // PHI-safe: log metadata only — never prompt/response text, never document content.
  private record(req: ModelRequest, costCentsEst: number, ok: boolean, err?: string) {
    const row: LedgerRow = {
      ts: Date.now(),
      purpose: req.purpose,
      intent: req.intent,
      model: this.opts.model,
      costCentsEst,
      ok,
      err,
    };
    this.ledger.push(row);
    this.opts.log?.("ai_call", { intent: row.intent, ok, costCentsEst, err: err ?? "" });
  }
}

// ---- MOCK transport: deterministic prose for offline / no-key runs. No numbers. ----
const MOCK_TEXT: Record<string, (v: Record<string, string>) => string> = {
  greeting: () =>
    "Hi — I'm billcheck. Send me a bill, statement, or EOB (a photo or PDF is fine), or just tell me what's going on.",
  "why.hold": () =>
    "It's a summary, not the itemized bill, and your insurer hasn't finished processing it yet — there's no EOB on file. Paying now risks overpaying before insurance is applied. Send the itemized bill and the EOB and I'll check the real number.",
  "why.ok": () =>
    "Your EOB and the bill line up: in-network, the plan applied your cost-share, and the provider billed exactly that. No duplicates or coding flags. You're fine to pay.",
  "why.off": () =>
    "The same procedure code appears more than once for a single visit, which generally isn't allowed (NCCI). One looks like a duplicate, so part of what they're billing may not be owed.",
  "why.dispute": () =>
    "You've already been charged, there's no itemized invoice, and you're disputing the service — so this isn't a 'wait for the bill' situation. Let's demand an itemized invoice and a refund, with a card chargeback as the backstop.",
  "why.need_more": () =>
    "I can't give you a confident answer yet — I need one more document to be sure. Send the itemized bill and the EOB (the insurer's 'this is not a bill') and I'll take it from there.",
};

export const mockTransport: Transport = async (req) => {
  const f = MOCK_TEXT[req.intent];
  return { text: f ? f(req.vars ?? {}) : "" };
};

/** Real Anthropic transport — only constructed when a key exists; dynamically imported so
 *  the dependency is optional. The model writes PROSE: it may reference figures from the facts
 *  it's handed or numbers the user stated, but it never originates the authoritative amount or
 *  verdict — those are computed by tools and rendered in cards (the Provenance principle). */
export function makeAnthropicTransport(apiKey: string): Transport {
  return async (req, model) => {
    let Anthropic: any;
    try {
      Anthropic = (await import("@anthropic-ai/sdk")).default;
    } catch {
      throw new Error("@anthropic-ai/sdk not installed; cannot use the real transport");
    }
    const client = new Anthropic({ apiKey });
    const system =
      req.system ??
      "You are billcheck, a concise medical-bill advisor. Write one or two plain sentences. " +
        "You may reference figures from the facts you're given or numbers the user stated; do not " +
        "invent an authoritative amount owed or a verdict — those are computed and shown separately.";
    const msg = await client.messages.create({
      model,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: req.prompt ?? req.intent }],
    });
    const text = (msg.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    return { text };
  };
}

/** Pick a transport from the environment: real if a key is set, else the offline mock. */
export function transportFromEnv(): { transport: Transport; model: string; live: boolean } {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.BILLCHECK_MODEL ?? "claude-sonnet-4-6";
  if (key) return { transport: makeAnthropicTransport(key), model, live: true };
  return { transport: mockTransport, model: `${model} (mock)`, live: false };
}
