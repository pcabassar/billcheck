import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCaseBundle, type DocumentRow, type LineItemRow } from "@/lib/case/queries";
import { formatCents } from "@/lib/case/money";
import { isCaseEditable, isParsePending } from "@/lib/case/rules";
import { LineItemEditor } from "./line-item-editor";
import { ParseWait } from "./parse-wait";
import { AuditKickButton } from "./audit-kick-button";

/**
 * S3 confirm (plan U6): the user checks our extraction before anything else
 * happens. Per-field display with low-confidence flags, inline edits (locked
 * once the case reaches AUDITED), a full-line review banner when the line
 * items don't reconcile to the printed total, and a refreshing wait state
 * while documents are still parsing.
 */

const DOC_KIND_LABELS: Record<string, string> = {
  bill: "Bill",
  eob: "EOB",
  gfe: "Good-faith estimate",
  receipt: "Receipt",
  collection_notice: "Collection notice",
  corrected_statement: "Corrected statement",
  other: "Document",
};

function docLabel(doc: DocumentRow): string {
  const kind = DOC_KIND_LABELS[doc.kind] ?? "Document";
  const version = doc.version_number > 1 ? ` (version ${doc.version_number})` : "";
  return `${kind}${version}`;
}

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const bundle = await getCaseBundle(supabase, id);
  if (!bundle) notFound();

  const { caseRow, documents, lineItems } = bundle;
  const stillParsing = documents.some((d) => isParsePending(d.parse_status));

  if (stillParsing) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Check what we read</h1>
          <p className="text-neutral-500">
            We&apos;re still reading your documents — this page updates itself.
          </p>
        </header>
        <ParseWait caseId={id} />
      </main>
    );
  }

  const editable = isCaseEditable(caseRow.state, caseRow.audit_locked_at);
  const reconciliationFailed = documents.some((d) => d.reconciliation_ok === false);
  const failedDocs = documents.filter((d) => d.parse_status === "failed");
  const itemsByDoc = new Map<string, LineItemRow[]>();
  for (const li of lineItems) {
    const list = itemsByDoc.get(li.document_id) ?? [];
    list.push(li);
    itemsByDoc.set(li.document_id, list);
  }
  const totalCents = lineItems.reduce((sum, li) => sum + (li.amount_cents ?? 0), 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Check what we read</h1>
        <p className="text-neutral-500">
          This is everything we pulled off your bill. Fix anything we got wrong —
          the audit runs on these numbers.
        </p>
      </header>

      {reconciliationFailed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">These lines don&apos;t add up</p>
          <p>
            The line items don&apos;t add up to the printed total — please review
            every line, not just the flagged ones.
          </p>
        </div>
      )}

      {!editable && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          This bill has already been audited, so these lines are locked. New
          corrections come in as a new statement version.
        </div>
      )}

      {failedDocs.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          We couldn&apos;t read{" "}
          {failedDocs.length === 1 ? "one of your documents" : `${failedDocs.length} of your documents`}
          . You can re-shoot it from the upload screen — the lines below come
          from what we could read.
        </div>
      )}

      {lineItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          No line items yet. If your documents failed to parse, try re-shooting
          them from the upload screen.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {documents.map((doc) => {
            const items = itemsByDoc.get(doc.id) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={doc.id} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {docLabel(doc)}
                </h2>
                <ul className="flex flex-col gap-3">
                  {items.map((li) => (
                    <LineItemEditor
                      key={li.id}
                      editable={editable}
                      item={{
                        id: li.id,
                        code: li.code,
                        descriptionRaw: li.description_raw,
                        units: li.units,
                        amountCents: li.amount_cents,
                        dateOfService: li.date_of_service,
                        confidence: li.confidence,
                      }}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
            <span className="font-medium">Line items total</span>
            <span className="font-medium">{formatCents(totalCents)}</span>
          </div>
        </div>
      )}

      <footer className="flex justify-end">
        {editable ? (
          <AuditKickButton caseId={id} />
        ) : (
          <Link
            href={`/case/${id}/decode`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Continue — explain my bill
          </Link>
        )}
      </footer>
    </main>
  );
}
