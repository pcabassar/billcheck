import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createLlmClient,
  zodToJsonSchema,
  PhaseGateError,
  LlmValidationError,
  type AiCallRow,
  type LlmTransport,
  type LlmTransportRequest,
  type LlmTransportResponse,
} from "./client";

// Silence the structured logger — these tests assert on the ledger, not logs.
beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(((
    _chunk: unknown,
  ) => true) as typeof process.stdout.write);
});
afterEach(() => vi.restoreAllMocks());

function transportOf(responses: LlmTransportResponse[]) {
  const requests: LlmTransportRequest[] = [];
  const transport: LlmTransport = {
    async create(req) {
      requests.push(req);
      const next = responses.shift();
      if (!next) throw new Error("mock transport exhausted");
      return next;
    },
  };
  return { transport, requests };
}

function ledgerOf() {
  const rows: AiCallRow[] = [];
  const ledger = async (row: AiCallRow): Promise<string> => {
    rows.push(row);
    return `led_${rows.length}`;
  };
  return { rows, ledger };
}

const emitResponse = (input: unknown): LlmTransportResponse => ({
  content: [{ type: "tool_use", id: "tu_1", name: "emit", input }],
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "tool_use",
});

const textResponse = (text: string): LlmTransportResponse => ({
  content: [{ type: "text", text }],
  usage: { input_tokens: 7, output_tokens: 3 },
  stop_reason: "end_turn",
});

const PDF_DOC = { documentId: "doc-1", mediaType: "application/pdf", base64: "JVBERi0xLjQ=" };
const Result = z.object({ value: z.number() });

function baseInput() {
  return {
    purpose: "parse" as const,
    documentId: "doc-1",
    caseId: "case-1",
    promptVersion: "parse-v1",
    prompt: "Extract the bill.",
  };
}

describe("zodToJsonSchema (hand-rolled subset)", () => {
  it("converts objects, strings, numbers, ints, booleans, arrays, enums, nullable, optional", () => {
    const schema = z.object({
      kind: z.enum(["bill", "eob"]),
      provider: z.string().nullable(),
      totalCents: z.number().int().nullable(),
      confidence: z.number(),
      itemized: z.boolean(),
      note: z.string().optional(),
      lines: z.array(z.object({ description: z.string() })),
    });
    expect(zodToJsonSchema(schema)).toEqual({
      type: "object",
      properties: {
        kind: { type: "string", enum: ["bill", "eob"] },
        provider: { anyOf: [{ type: "string" }, { type: "null" }] },
        totalCents: { anyOf: [{ type: "integer" }, { type: "null" }] },
        confidence: { type: "number" },
        itemized: { type: "boolean" },
        note: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: { description: { type: "string" } },
            required: ["description"],
            additionalProperties: false,
          },
        },
      },
      required: ["kind", "provider", "totalCents", "confidence", "itemized", "lines"],
      additionalProperties: false,
    });
  });

  it("propagates .describe() descriptions", () => {
    expect(zodToJsonSchema(z.string().describe("as printed"))).toEqual({
      type: "string",
      description: "as printed",
    });
  });

  it("throws loudly on unsupported zod types", () => {
    expect(() => zodToJsonSchema(z.date())).toThrow(/unsupported zod type/);
  });
});

describe("PHASE gate (pre-BAA boundary, fail closed)", () => {
  it("PHASE=A blocks document-bearing calls for non-test accounts BEFORE any API call", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 1 })]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "A", ledger, transport });

    await expect(
      client.call({ ...baseInput(), documents: [PDF_DOC], isTestAccount: false, schema: Result }),
    ).rejects.toBeInstanceOf(PhaseGateError);

    expect(requests).toHaveLength(0); // nothing reached the API
    expect(rows).toHaveLength(1); // refused call still ledgered
    expect(rows[0].errorCode).toBe("PHASE_GATE_BLOCKED");
    expect(rows[0].rawCompletion).toBeNull();
  });

  it("PHASE=A blocks when isTestAccount is missing (fail closed)", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 1 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "A", ledger, transport });

    await expect(
      client.call({ ...baseInput(), documents: [PDF_DOC], schema: Result }),
    ).rejects.toBeInstanceOf(PhaseGateError);
    expect(requests).toHaveLength(0);
  });

  it("PHASE=A allows document-bearing calls for flagged test accounts", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 7 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "A", ledger, transport });

    const res = await client.call({
      ...baseInput(),
      documents: [PDF_DOC],
      isTestAccount: true,
      schema: Result,
    });
    expect(res.output).toEqual({ value: 7 });
    expect(requests).toHaveLength(1);
  });

  it("PHASE=B does not gate", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 7 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    const res = await client.call({
      ...baseInput(),
      documents: [PDF_DOC],
      isTestAccount: false,
      schema: Result,
    });
    expect(res.output).toEqual({ value: 7 });
    expect(requests).toHaveLength(1);
  });

  it("PHASE=A passes documentless calls through", async () => {
    const { transport, requests } = transportOf([textResponse("hello")]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "A", ledger, transport });

    const res = await client.call({ ...baseInput(), isTestAccount: false });
    expect(res.output).toBe("hello");
    expect(requests).toHaveLength(1);
  });
});

describe("structured output via forced emit tool", () => {
  it("forces the emit tool with the zod-derived input_schema", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 7 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await client.call({ ...baseInput(), schema: Result });
    expect(requests[0].tool_choice).toEqual({ type: "tool", name: "emit" });
    expect(requests[0].tools?.[0].name).toBe("emit");
    expect(requests[0].tools?.[0].input_schema).toEqual(zodToJsonSchema(Result));
  });

  it("builds document + text content blocks (pdf as document, image as image)", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 7 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await client.call({
      ...baseInput(),
      documents: [PDF_DOC, { documentId: "doc-2", mediaType: "image/png", base64: "iVBOR" }],
      schema: Result,
    });
    const content = requests[0].messages[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(3);
    expect(content[0].type).toBe("document");
    expect(content[1].type).toBe("image");
    expect(content[2]).toEqual({ type: "text", text: "Extract the bill." });
  });

  it("retries exactly once on validation failure, feeding the error back as an is_error tool_result", async () => {
    const { transport, requests } = transportOf([
      emitResponse({ value: "not-a-number" }),
      emitResponse({ value: 42 }),
    ]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    const res = await client.call({ ...baseInput(), schema: Result });
    expect(res.output).toEqual({ value: 42 });
    expect(requests).toHaveLength(2);

    const retryMessages = requests[1].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1].role).toBe("assistant");
    const retryContent = retryMessages[2].content as Array<Record<string, unknown>>;
    expect(retryContent[0].type).toBe("tool_result");
    expect(retryContent[0].tool_use_id).toBe("tu_1");
    expect(retryContent[0].is_error).toBe(true);

    // Tokens accumulate across both attempts; one success ledger row.
    expect(res.tokensIn).toBe(20);
    expect(res.tokensOut).toBe(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].errorCode).toBeNull();
  });

  it("fails with LlmValidationError and an error ledger row when the retry also fails", async () => {
    const { transport, requests } = transportOf([
      emitResponse({ value: "nope" }),
      emitResponse({ value: "still nope" }),
    ]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await expect(client.call({ ...baseInput(), schema: Result })).rejects.toBeInstanceOf(
      LlmValidationError,
    );
    expect(requests).toHaveLength(2); // exactly one retry, never more
    expect(rows).toHaveLength(1);
    expect(rows[0].errorCode).toBe("LLM_SCHEMA_VALIDATION");
    expect(rows[0].errorPayload).toBeTruthy();
    expect(rows[0].tokensIn).toBe(20);
  });

  it("treats a missing emit call as a validation failure", async () => {
    const { transport } = transportOf([textResponse("no tool"), emitResponse({ value: 1 })]);
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    const res = await client.call({ ...baseInput(), schema: Result });
    expect(res.output).toEqual({ value: 1 });
  });
});

describe("ledger rows (every call, success and failure)", () => {
  it("writes a success row with refs/tokens/latency and returns its id", async () => {
    const { transport } = transportOf([emitResponse({ value: 7 })]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({
      apiKey: "k",
      model: "claude-sonnet-4-6",
      phase: "A",
      ledger,
      transport,
    });

    const res = await client.call({
      ...baseInput(),
      documents: [PDF_DOC],
      isTestAccount: true,
      schema: Result,
    });
    expect(res.ledgerId).toBe("led_1");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.purpose).toBe("parse");
    expect(row.modelId).toBe("claude-sonnet-4-6");
    expect(row.promptVersion).toBe("parse-v1");
    expect(row.documentId).toBe("doc-1");
    expect(row.caseId).toBe("case-1");
    expect(row.tokensIn).toBe(10);
    expect(row.tokensOut).toBe(5);
    expect(row.stopReason).toBe("tool_use");
    expect(row.validatedOutput).toEqual({ value: 7 });
    expect(typeof row.latencyMs).toBe("number");
  });

  it("inputRefs carries document IDs and char counts only — never bytes or text", async () => {
    const { transport } = transportOf([emitResponse({ value: 7 })]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await client.call({ ...baseInput(), documents: [PDF_DOC], schema: Result });
    expect(rows[0].inputRefs).toEqual({
      documentIds: ["doc-1"],
      promptChars: "Extract the bill.".length,
      systemChars: 0,
    });
    expect(JSON.stringify(rows[0].inputRefs)).not.toContain(PDF_DOC.base64);
  });

  it("writes an error row with the full payload when the transport throws, then rethrows", async () => {
    const boom = Object.assign(new Error("upstream said: 4206 CHEST XRAY"), { status: 500 });
    const transport: LlmTransport = {
      async create() {
        throw boom;
      },
    };
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await expect(client.call({ ...baseInput(), schema: Result })).rejects.toBe(boom);
    expect(rows).toHaveLength(1);
    expect(rows[0].errorCode).toBe("API_500");
    const payload = rows[0].errorPayload as Record<string, unknown>;
    expect(payload.message).toContain("CHEST XRAY"); // full error belongs in the DB row...
  });

  it("...but never in logs (sanitized logger drops the message)", async () => {
    const writes: string[] = [];
    vi.restoreAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const boom = Object.assign(new Error("echoes document text 4206 CHEST XRAY"), {
      status: 500,
    });
    const transport: LlmTransport = {
      async create() {
        throw boom;
      },
    };
    const { ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await expect(client.call({ ...baseInput(), schema: Result })).rejects.toBe(boom);
    expect(writes.length).toBeGreaterThan(0);
    for (const line of writes) {
      expect(line).not.toContain("CHEST XRAY");
      expect(line).not.toContain("4206");
    }
  });

  it("rejects unsupported media types before any API call, with a ledger row", async () => {
    const { transport, requests } = transportOf([emitResponse({ value: 1 })]);
    const { rows, ledger } = ledgerOf();
    const client = createLlmClient({ apiKey: "k", phase: "B", ledger, transport });

    await expect(
      client.call({
        ...baseInput(),
        documents: [{ documentId: "doc-3", mediaType: "text/html", base64: "PGh0bWw+" }],
        schema: Result,
      }),
    ).rejects.toThrow("unsupported document media type");
    expect(requests).toHaveLength(0);
    expect(rows[0].errorCode).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});
