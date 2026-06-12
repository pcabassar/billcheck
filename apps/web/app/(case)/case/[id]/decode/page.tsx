import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCaseBundle } from "@/lib/case/queries";
import { formatCents } from "@/lib/case/money";
import { isParsePending, type AttestationStatus } from "@/lib/case/rules";
import { AttestationPills } from "./attestation-pills";

/**
 * S3b decode (plan U6): each line as a card — plain-English meaning prominent,
 * code + amount secondary — with attestation pills. "Didn't happen" and
 * "not sure" lines get extra scrutiny: they feed the letter's records-request
 * paragraph and are stored for V1's records checks. Skipping is always
 * allowed; the verdict is unaffected.
 */

export default async function DecodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const bundle = await getCaseBundle(supabase, id);
  if (!bundle) notFound();

  const { documents, lineItems, attestations } = bundle;

  // Decode follows confirm: if parsing is still in flight, the confirm
  // screen owns the wait state.
  if (documents.some((d) => isParsePending(d.parse_status))) {
    redirect(`/case/${id}/confirm`);
  }

  const attestationByItem = new Map<string, AttestationStatus>(
    attestations.map((a) => [a.line_item_id, a.status]),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">What your bill says</h1>
        <p className="text-neutral-500">
          Here&apos;s each charge in plain English. Tell us if you remember it —
          you can skip any line.
        </p>
      </header>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        <p className="font-medium text-neutral-900 dark:text-neutral-100">
          Why we ask
        </p>
        <p>
          If something didn&apos;t happen — or you&apos;re not sure — we dig
          deeper: those lines get extra scrutiny in the audit, and your letter
          can ask the provider for the records behind them.
        </p>
      </div>

      {lineItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          No line items to decode yet.{" "}
          <Link href={`/case/${id}/confirm`} className="underline">
            Back to the confirm screen
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lineItems.map((li) => (
            <li
              key={li.id}
              className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {li.description_plain ?? (
                    <span className="italic text-neutral-500">
                      Plain-English explanation coming — original text:{" "}
                      {li.description_raw}
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-500">
                  {li.code ? (
                    <span className="font-mono">{li.code}</span>
                  ) : (
                    "no code"
                  )}
                  {" · "}
                  {formatCents(li.amount_cents)}
                  {li.units && li.units > 1 ? ` (×${li.units})` : ""}
                  {li.date_of_service ? ` · ${li.date_of_service}` : ""}
                </p>
              </div>
              <AttestationPills
                lineItemId={li.id}
                initial={attestationByItem.get(li.id) ?? null}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between">
        <Link
          href={`/case/${id}`}
          className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Skip for now
        </Link>
        <Link
          href={`/case/${id}`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Continue
        </Link>
      </footer>
    </main>
  );
}
