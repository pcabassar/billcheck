import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@billcheck/shared";
import type { AttestationStatus } from "@/lib/case/rules";

/**
 * Read helpers for the case screens (S3 confirm, S3b decode). All queries run
 * under the USER's JWT — RLS owner-only policies are the ownership check.
 * Row shapes mirror supabase/migrations/0001_core.sql (snake_case, money in
 * integer cents).
 */

export interface CaseRow {
  id: string;
  state: string;
  primary_verdict: string | null;
  created_at: string;
}

export type ParseStatus = "pending" | "parsing" | "parsed" | "failed";

export interface DocumentRow {
  id: string;
  kind: string;
  filename: string | null;
  parse_status: ParseStatus;
  version_number: number;
  /**
   * Written by the U5 parse step's arithmetic reconciliation gate. The column
   * lands with U5's migration — documents are selected with `*` so this stays
   * `undefined` (unknown) until that migration applies, instead of erroring.
   * Only an explicit `false` triggers the full-line review banner.
   */
  reconciliation_ok?: boolean | null;
}

export interface LineItemRow {
  id: string;
  document_id: string;
  code: string | null;
  code_system: string | null;
  description_raw: string;
  description_plain: string | null;
  units: number | null;
  amount_cents: number | null;
  date_of_service: string | null;
  confidence: number;
}

export interface AttestationRow {
  id: string;
  line_item_id: string;
  status: AttestationStatus;
}

export interface CaseBundle {
  caseRow: CaseRow;
  documents: DocumentRow[];
  lineItems: LineItemRow[];
  attestations: AttestationRow[];
}

export async function getCaseBundle(
  supabase: SupabaseClient,
  caseId: string,
): Promise<CaseBundle | null> {
  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, state, primary_verdict, created_at")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError) {
    logError("case.bundle.case_query_failed", caseError, { caseId });
    return null;
  }
  if (!caseRow) return null;

  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (docError) {
    logError("case.bundle.documents_query_failed", docError, { caseId });
    return null;
  }

  const docIds = (documents ?? []).map((d: { id: string }) => d.id);
  let lineItems: LineItemRow[] = [];
  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from("line_items")
      .select(
        "id, document_id, code, code_system, description_raw, description_plain, units, amount_cents, date_of_service, confidence",
      )
      .in("document_id", docIds)
      .order("created_at", { ascending: true });
    if (error) {
      logError("case.bundle.line_items_query_failed", error, { caseId });
      return null;
    }
    lineItems = (data ?? []) as LineItemRow[];
  }

  let attestations: AttestationRow[] = [];
  if (lineItems.length > 0) {
    const { data, error } = await supabase
      .from("attestations")
      .select("id, line_item_id, status")
      .in(
        "line_item_id",
        lineItems.map((li) => li.id),
      );
    if (error) {
      logError("case.bundle.attestations_query_failed", error, { caseId });
      return null;
    }
    attestations = (data ?? []) as AttestationRow[];
  }

  return {
    caseRow: caseRow as CaseRow,
    documents: (documents ?? []) as DocumentRow[],
    lineItems,
    attestations,
  };
}
