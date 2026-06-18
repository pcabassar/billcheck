import { describe, expect, it } from "vitest";
import { CHECK_VERSION, runC3Duplicates } from "./c3-duplicates";
import { engineInput, li, refs } from "../test-helpers";

describe("C3 duplicates", () => {
  it("fires HIGH on the same code + date + document appearing twice", () => {
    const a = li({ code: "36415", documentId: "doc-1", dateOfService: "2026-05-01", amountCents: 1500 });
    const b = li({ code: "36415", documentId: "doc-1", dateOfService: "2026-05-01", amountCents: 1500 });
    const result = runC3Duplicates(engineInput([a, b]), refs());

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const finding = result![0];
    expect(finding.checkId).toBe("C3");
    expect(finding.checkVersion).toBe(CHECK_VERSION);
    expect(finding.confidenceTier).toBe("high");
    expect(finding.amountImpactCents).toBe(1500); // 3000 total - 1500 kept
    expect(finding.evidenceKey).toBe("C3:36415:2026-05-01:doc-1");
    expect(finding.evidence).toHaveLength(2);
    expect(finding.evidence.map((e) => e.lineItemId)).toEqual([a.id, b.id]);
    expect(finding.refVersions).toEqual({});
  });

  it("a triple occurrence flags the duplicated amount beyond the priciest line", () => {
    const lines = [
      li({ code: "85025", amountCents: 1000 }),
      li({ code: "85025", amountCents: 1200 }),
      li({ code: "85025", amountCents: 1000 }),
    ];
    const result = runC3Duplicates(engineInput(lines), refs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(2000); // 3200 - max(1200)
  });

  it("SUPPRESSES cross-document matches (paired facility/professional bills)", () => {
    const facility = li({ code: "80053", documentId: "doc-fac", dateOfService: "2026-05-02", amountCents: 9000 });
    const professional = li({ code: "80053", documentId: "doc-pro", dateOfService: "2026-05-02", amountCents: 4500 });
    const result = runC3Duplicates(engineInput([facility, professional]), refs());
    expect(result).toEqual([]); // ran, zero findings — never a cross-doc duplicate
  });

  it("still fires within one document even when the same code also appears on a paired document", () => {
    const lines = [
      li({ code: "80053", documentId: "doc-fac", amountCents: 9000 }),
      li({ code: "80053", documentId: "doc-fac", amountCents: 9000 }),
      li({ code: "80053", documentId: "doc-pro", amountCents: 4500 }),
    ];
    const result = runC3Duplicates(engineInput(lines), refs());
    expect(result).toHaveLength(1);
    expect(result![0].evidenceKey).toBe("C3:80053:2026-05-01:doc-fac");
    expect(result![0].evidence).toHaveLength(2);
  });

  it("does not group the same code across different dates of service", () => {
    const lines = [
      li({ code: "36415", dateOfService: "2026-05-01" }),
      li({ code: "36415", dateOfService: "2026-05-02" }),
    ];
    expect(runC3Duplicates(engineInput(lines), refs())).toEqual([]);
  });

  it("groups null dates of service together (still same-document only)", () => {
    const lines = [
      li({ code: "36415", dateOfService: null, amountCents: 1500 }),
      li({ code: "36415", dateOfService: null, amountCents: 1500 }),
    ];
    const result = runC3Duplicates(engineInput(lines), refs());
    expect(result).toHaveLength(1);
    expect(result![0].evidenceKey).toBe("C3:36415::doc-1");
  });

  it("returns null (skipped_no_data) when the input is not itemized", () => {
    const lines = [li({ code: "36415" }), li({ code: "36415" })];
    expect(runC3Duplicates(engineInput(lines, { itemized: false }), refs())).toBeNull();
  });

  it("returns null when no line items carry codes", () => {
    const lines = [li({ code: null }), li({ code: null })];
    expect(runC3Duplicates(engineInput(lines), refs())).toBeNull();
  });

  it("returns null on an empty line-item list", () => {
    expect(runC3Duplicates(engineInput([]), refs())).toBeNull();
  });

  it("reports a null amount when every duplicate line lacks an amount", () => {
    const lines = [
      li({ code: "36415", amountCents: null }),
      li({ code: "36415", amountCents: null }),
    ];
    const result = runC3Duplicates(engineInput(lines), refs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBeNull();
  });

  it("counts only known amounts when some duplicate lines lack an amount", () => {
    const lines = [
      li({ code: "36415", amountCents: 1500 }),
      li({ code: "36415", amountCents: null }),
      li({ code: "36415", amountCents: 1500 }),
    ];
    const result = runC3Duplicates(engineInput(lines), refs());
    expect(result![0].amountImpactCents).toBe(1500); // 3000 known - 1500 kept
  });
});
