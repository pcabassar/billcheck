// billcheck V0.1 — core types.
// Greenfield. The whole architecture in one idea: the agent picks WHICH card to
// show; the NUMBERS in every card come from tool-produced "facts" (each with a
// stable id). That's the Provenance principle, by construction.

/** A fact is the only place a number/verdict-relevant value may originate: a tool output. */
export type FactId = string; // e.g. "line:doc1:4", "eob:doc2:patientResp", "finding:audit:dup-1"

export type Money = number; // integer cents, always.

export type DocumentKind =
  | "statement" // unofficial summary, no line items
  | "itemized" // official line-by-line bill (UB-04 / CMS-1500)
  | "eob" // insurer's "this is not a bill"
  | "receipt"
  | "collection_notice"
  | "denial_letter"
  | "gfe"
  | "unknown";

export interface LineItemFact {
  id: FactId;
  code?: string; // CPT/HCPCS
  description: string;
  units?: number;
  amountCents: Money;
}

export interface EobFact {
  id: FactId; // the EOB fact bundle
  billedCents?: Money;
  allowedCents?: Money;
  planPaidCents?: Money;
  patientRespCents?: Money;
  source: "eob";
}

export interface ParsedDocument {
  id: string; // document id
  kind: DocumentKind;
  itemized: boolean; // true only when real line items are present
  quality: "clear" | "low"; // parse confidence proxy
  pages: number;
  provider?: string;
  printedTotalCents?: Money;
  lineItems: LineItemFact[];
  eob?: EobFact;
}

export interface Finding {
  id: FactId; // "finding:audit:..."
  checkId: "duplicate" | "reconcile" | "preventive"; // V0.1 starter checks
  title: string;
  amountImpactCents: Money | null; // null = leverage, not a dollar claim
  evidence: FactId[]; // the line/eob facts this is based on
}

export type VerdictKind =
  | "hold" // don't pay yet — it's a statement / not final
  | "ok" // looks correct, fine to pay
  | "off" // something's off — options
  | "dispute" // you were charged & surprised — dispute
  | "need_more" // need one more thing
  | "other"; // expert reasoned outside the patterns

/** The fund of facts available this turn — the ONLY legal sources for card numbers. */
export interface FactBook {
  docs: Record<string, ParsedDocument>;
  findings: Finding[];
  /** flat index id -> cents, for the provenance check + amount rendering */
  amounts: Record<FactId, Money>;
}

// ---- Cards (UI parts). Every monetary field is { cents, src } where src is a FactId. ----
export interface Sourced {
  cents: Money;
  src: FactId; // MUST exist in the FactBook
  label: string;
}

export interface VerdictCard {
  type: "verdict";
  verdict: VerdictKind;
  title: string;
  why: string;
  basis: string[]; // human-readable basis tags
  amounts?: { rows: Sourced[]; total?: Sourced; note?: string };
  options?: { rank: number; text: string; odds?: string }[];
}

export interface DocChipCard {
  type: "doc";
  kind: DocumentKind;
  name: string;
  pages: number;
}

export interface ConfirmCard {
  type: "confirm";
  title: string;
  subject: string;
  body: string;
  sourcedFigures: FactId[]; // every $ in `body` traces to these
}

export interface ActivityCard {
  type: "activity";
  entries: { t: string; text: string; mark?: boolean }[];
}

export type Card = VerdictCard | DocChipCard | ConfirmCard | ActivityCard;

/** A streamed part: either conversational text, or an owned card bound to facts. */
export type Part =
  | { type: "text"; text: string }
  | { type: "card"; card: Card };

export interface AgentTurn {
  parts: Part[];
  status: string; // case status to display
  /** the FactBook used this turn (for the provenance check + debugging) */
  facts: FactBook;
}
