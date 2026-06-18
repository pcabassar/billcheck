// Tools. Each returns typed, id-bearing facts — the only legal source of numbers.
// Offline-first: inputs are structured doc descriptors (no OCR/model needed), so
// these run deterministically in the harness and the app's mock path alike.

import type {
  ParsedDocument,
  LineItemFact,
  EobFact,
  Finding,
  FactBook,
  DocumentKind,
  Money,
} from "./types";

export interface DocInput {
  id: string;
  kind: DocumentKind;
  provider?: string;
  pages?: number;
  quality?: "clear" | "low";
  lines?: { code?: string; description: string; units?: number; amountCents: Money }[];
  printedTotalCents?: Money;
  eob?: {
    billedCents?: Money;
    allowedCents?: Money;
    planPaidCents?: Money;
    patientRespCents?: Money;
  };
}

/** Field-level fact ids for an EOB (so each amount a card shows has its own source). */
export const eobFieldId = (docId: string, field: string): string => `eob:${docId}:${field}`;
export const lineId = (docId: string, i: number): string => `line:${docId}:${i}`;

/** tool: parseDocument — classify + extract line items / EOB fields into facts. */
export function parseDocument(input: DocInput): ParsedDocument {
  const lines: LineItemFact[] = (input.lines ?? []).map((l, i) => ({
    id: lineId(input.id, i),
    code: l.code,
    description: l.description,
    units: l.units,
    amountCents: l.amountCents,
  }));
  let eob: EobFact | undefined;
  if (input.eob) {
    eob = { id: `eob:${input.id}`, source: "eob", ...input.eob };
  }
  return {
    id: input.id,
    kind: input.kind,
    itemized: lines.length > 0,
    quality: input.quality ?? "clear",
    pages: input.pages ?? 1,
    provider: input.provider,
    printedTotalCents: input.printedTotalCents,
    lineItems: lines,
    eob,
  };
}

/** tool: runAudit — deterministic checks over parsed docs. V0.1 starter: duplicate + reconcile. */
export function runAudit(docs: ParsedDocument[]): Finding[] {
  const findings: Finding[] = [];
  const itemized = docs.filter((d) => d.itemized);

  // duplicate (NCCI-style): same CPT code appears 2+ times within one itemized doc.
  for (const d of itemized) {
    const byCode = new Map<string, LineItemFact[]>();
    for (const li of d.lineItems) {
      if (!li.code) continue;
      const arr = byCode.get(li.code) ?? [];
      arr.push(li);
      byCode.set(li.code, arr);
    }
    for (const [code, items] of byCode) {
      if (items.length >= 2) {
        // impact = the value of the duplicate copies (all but one).
        const impact = items.slice(1).reduce((s, x) => s + x.amountCents, 0);
        findings.push({
          id: `finding:audit:dup-${d.id}-${code}`,
          checkId: "duplicate",
          title: `Code ${code} billed ${items.length}× in one visit (likely duplicate)`,
          amountImpactCents: impact,
          evidence: items.map((x) => x.id),
        });
      }
    }
  }
  return findings;
}

/** Build the FactBook: the flat index of every legal numeric source for this turn. */
export function buildFactBook(docs: ParsedDocument[], findings: Finding[]): FactBook {
  const amounts: Record<string, Money> = {};
  const docMap: Record<string, ParsedDocument> = {};
  for (const d of docs) {
    docMap[d.id] = d;
    for (const li of d.lineItems) amounts[li.id] = li.amountCents;
    if (d.eob) {
      const e = d.eob;
      if (e.billedCents != null) amounts[eobFieldId(d.id, "billed")] = e.billedCents;
      if (e.allowedCents != null) amounts[eobFieldId(d.id, "allowed")] = e.allowedCents;
      if (e.planPaidCents != null) amounts[eobFieldId(d.id, "planPaid")] = e.planPaidCents;
      if (e.patientRespCents != null) amounts[eobFieldId(d.id, "patientResp")] = e.patientRespCents;
    }
  }
  for (const f of findings) {
    if (f.amountImpactCents != null) amounts[f.id] = f.amountImpactCents;
  }
  return { docs: docMap, findings, amounts };
}

export const fmt = (cents: Money): string =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
