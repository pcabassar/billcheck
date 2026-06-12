import { describe, expect, it, vi, afterEach } from "vitest";
import { log, logError } from "./logger.js";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => vi.restoreAllMocks());

describe("logger field allowlist (no-PHI-in-logs enforcement)", () => {
  it("passes allowlisted fields through", () => {
    const cap = captureStdout();
    log("parse.completed", { caseId: "c1", durationMs: 42, check: "C3" });
    cap.restore();
    const entry = JSON.parse(cap.lines[0]);
    expect(entry.event).toBe("parse.completed");
    expect(entry.caseId).toBe("c1");
    expect(entry.durationMs).toBe(42);
  });

  it("drops non-allowlisted fields silently and counts them", () => {
    const cap = captureStdout();
    log("parse.completed", {
      caseId: "c1",
      patientName: "Jane Doe", // PHI — must never appear
      rawText: "CPT 99285 $4,206.00", // document content — must never appear
    });
    cap.restore();
    const raw = cap.lines[0];
    expect(raw).not.toContain("Jane Doe");
    expect(raw).not.toContain("99285");
    expect(raw).not.toContain("patientName");
    const entry = JSON.parse(raw);
    expect(entry.droppedFields).toBe(2);
  });

  it("logError never emits error messages (which can echo document content)", () => {
    const cap = captureStdout();
    const err = new Error('Expected number at line_items[3].amountCents, got "4,206.00 CHEST XRAY"');
    logError("parse.failed", err, { documentId: "d9" });
    cap.restore();
    const raw = cap.lines[0];
    expect(raw).not.toContain("CHEST XRAY");
    expect(raw).not.toContain("4,206");
    const entry = JSON.parse(raw);
    expect(entry.errorClass).toBe("Error");
    expect(entry.documentId).toBe("d9");
    expect(entry.level).toBe("error");
  });
});
