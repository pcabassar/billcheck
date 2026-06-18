import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { suggestedTipCents } from "@/lib/savings-diff";
import { PwywPanel } from "./pwyw-panel";

/**
 * S16 — outcome (plan U14). Two shapes:
 *  - RESOLVED_VERIFIED: a corrected statement diffed to verified savings →
 *    anchored PWYW ("$X saved", suggested ≈10%).
 *  - RESOLVED_SELF_REPORTED: a self-reported win → unanchored PWYW (no
 *    dollar claim) + an upload-to-verify nudge.
 * Other states bounce back to the action plan.
 */

const UNANCHORED_DEFAULT_CENTS = 500;

export default async function OutcomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state, verified_savings_cents")
    .eq("id", id)
    .maybeSingle();
  if (!caseRow) notFound();

  const verified = caseRow.state === "RESOLVED_VERIFIED";
  const selfReported = caseRow.state === "RESOLVED_SELF_REPORTED";

  if (!verified && !selfReported) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <h1 className="text-2xl font-bold">Not resolved yet</h1>
        <p className="text-neutral-500">
          This case hasn&apos;t reached an outcome.{" "}
          <Link href={`/case/${id}/plan`} className="underline">
            Back to your action plan
          </Link>
          .
        </p>
      </main>
    );
  }

  const savingsCents = verified ? Number(caseRow.verified_savings_cents ?? 0) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">
          {verified ? "Verified outcome" : "Thanks for telling us"}
        </h1>
        {verified && savingsCents !== null ? (
          <p className="text-neutral-500">
            We compared your corrected statement to the original bill and
            confirmed <span className="font-semibold">{formatCents(savingsCents)}</span> in savings.
          </p>
        ) : (
          <p className="text-neutral-500">
            Glad it moved. If you get a corrected statement,{" "}
            <Link href={`/upload?caseId=${id}`} className="underline">
              upload it
            </Link>{" "}
            and we&apos;ll verify the exact savings.
          </p>
        )}
      </header>

      <PwywPanel
        caseId={id}
        savingsCents={savingsCents}
        suggestedCents={
          savingsCents && savingsCents > 0 ? suggestedTipCents(savingsCents) : UNANCHORED_DEFAULT_CENTS
        }
      />

      <footer>
        <Link href="/bills" className="text-sm text-neutral-500 underline">
          Back to your bills
        </Link>
      </footer>
    </main>
  );
}
