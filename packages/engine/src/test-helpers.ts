import type { LineItem } from "@billcheck/shared";
import type { EngineInput, ReferenceData } from "./types";

/** Test-only factories (synthetic data; no real codes-to-patient linkage anywhere). */

let counter = 0;

export function li(overrides: Partial<LineItem> = {}): LineItem {
  counter += 1;
  return {
    id: `L${counter}`,
    documentId: "doc-1",
    code: null,
    codeSystem: null,
    descriptionRaw: "synthetic line",
    descriptionPlain: null,
    units: 1,
    amountCents: 1000,
    dateOfService: "2026-05-01",
    confidence: 0.99,
    ...overrides,
  };
}

export function engineInput(
  lineItems: LineItem[],
  overrides: Partial<Omit<EngineInput, "lineItems">> = {},
): EngineInput {
  return { caseId: "case-test", itemized: true, lineItems, ...overrides };
}

export function refs(overrides: Partial<ReferenceData> = {}): ReferenceData {
  return {
    versions: { ncciPtp: "TEST1", mue: "TEST1", medicareRates: "TEST1", fapPolicies: "TEST1", carcRarc: "TEST1" },
    ncciPtp: new Set(["80053|80048", "97140|97110"]),
    mue: new Map([
      ["J0696", 4],
      ["36415", 1],
      ["80053", 1],
    ]),
    fapPolicies: [
      { hospitalName: "St. Mary's Medical Center", state: "NY", thresholdFreeFpl: 2.0, thresholdDiscountFpl: 4.0 },
      { hospitalName: "Lakewood Urgent Care", state: "NJ", thresholdFreeFpl: null, thresholdDiscountFpl: 3.0 },
    ],
    carcLiability: new Map([
      ["CO-29", "provider_writeoff"],
      ["CO-45", "provider_writeoff"],
      ["CO-97", "provider_writeoff"],
      ["PR-1", "patient"],
      ["PR-2", "patient"],
      ["PR-3", "patient"],
    ]),
    medicareRatesCents: new Map([
      ["99285", 18500],
      ["80053", 1451],
      ["36415", 300],
      ["J0696", 1200],
    ]),
    ...overrides,
  };
}

export function emptyRefs(): ReferenceData {
  return {
    versions: { ncciPtp: "TEST1", mue: "TEST1", medicareRates: "TEST1", fapPolicies: "TEST1", carcRarc: "TEST1" },
    ncciPtp: new Set(),
    mue: new Map(),
    medicareRatesCents: new Map(),
    fapPolicies: [],
    carcLiability: new Map(),
  };
}
