import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GenerateLetterButton } from "./generate-letter-button";
import { VerdictWait } from "./verdict-wait";

/**
 * S12 — action plan (plan U9). Verdict summary placeholder (full verdict
 * screens land in U12), findings list from the current completed run, the
 * three delivery options, and the generate-letter action.
 */

interface FindingRow {
  id: string;
  title: string;
  amount_impact_cents: number | null;
  confidence_tier: string;
}

interface ArtifactRow {
  id: string;
  approved_at: string | null;
  created_at: string;
}

const TIER_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  review: "Needs review",
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state, primary_verdict, current_run_id, audit_locked_at")
    .eq("id", id)
    .maybeSingle();
  if (!caseRow) notFound();

  // The audit runs while the user walks decode — arrivals here may precede
  // the verdict. Wait honestly instead of rendering an empty plan.
  if (caseRow.state === "CAPTURED" || (caseRow.state === "TRIAGED" && !caseRow.audit_locked_at)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <h1 className="text-2xl font-bold">Your action plan</h1>
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          The audit hasn&apos;t run yet.{" "}
          <Link href={`/case/${id}/confirm`} className="underline">
            Review what we read first
          </Link>
          , then kick off the audit from there.
        </p>
      </main>
    );
  }
  if (caseRow.state === "TRIAGED" || (caseRow.state === "AUDITED" && !caseRow.current_run_id)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <h1 className="text-2xl font-bold">Your action plan</h1>
        <VerdictWait caseId={id} />
      </main>
    );
  }

  let findings: FindingRow[] = [];
  if (caseRow.current_run_id) {
    const { data } = await supabase
      .from("findings")
      .select("id, title, amount_impact_cents, confidence_tier")
      .eq("run_id", caseRow.current_run_id)
      .order("created_at", { ascending: true });
    findings = (data ?? []) as FindingRow[];
  }

  const { data: artifactsData } = await supabase
    .from("artifacts")
    .select("id, approved_at, created_at")
    .eq("case_id", id)
    .eq("type", "dispute")
    .order("created_at", { ascending: false });
  const artifacts = (artifactsData ?? []) as ArtifactRow[];

  const totalImpactCents = findings.reduce(
    (sum, f) => sum + (f.amount_impact_cents ?? 0),
    0,
  );
  const canGenerate = Boolean(caseRow.current_run_id) && findings.length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/bills" className="text-sm text-neutral-500 hover:underline">
          &larr; Your bills
        </Link>
        <h1 className="text-2xl font-bold">Your action plan</h1>
      </header>

      <section
        aria-label="Verdict summary"
        className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Verdict
        </h2>
        <p className="mt-1 text-xl font-semibold">
          {caseRow.primary_verdict ?? "Audit in progress"}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {findings.length > 0
            ? `${findings.length} issue${findings.length === 1 ? "" : "s"} found, ${formatCents(totalImpactCents)} in disputed charges.`
            : caseRow.current_run_id
              ? "No disputable findings in the checks we could run."
              : "Checks haven't finished yet — come back shortly."}
        </p>
      </section>

      <section aria-label="Findings" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">What we found</h2>
        {findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Findings appear here once the audit completes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{f.title}</span>
                  <span className="text-xs text-neutral-500">
                    {TIER_LABELS[f.confidence_tier] ?? f.confidence_tier}
                  </span>
                </div>
                {f.amount_impact_cents !== null && (
                  <span className="shrink-0 font-semibold">
                    {formatCents(f.amount_impact_cents)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Delivery options" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">How to send your dispute letter</h2>
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-medium">Portal-guided</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                Free
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              We give you paste-ready text and walk you through submitting it in
              your provider&apos;s billing portal.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-medium">Do it yourself</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                Free
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Download and print the letter, then mail it to the billing address
              on your statement.
            </p>
          </div>
          <div
            aria-disabled="true"
            className="rounded-lg border border-neutral-200 p-4 opacity-50 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">We send it for you — $7</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                Coming soon
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              We print and mail it with tracking. Not available yet.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Generate letter" className="flex flex-col gap-3">
        {artifacts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {artifacts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/case/${caseRow.id}/letter/${a.id}`}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <span className="font-medium">
                    Dispute letter — {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {a.approved_at ? "Approved" : "Awaiting your approval"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <GenerateLetterButton
          caseId={caseRow.id}
          canGenerate={canGenerate}
          hasExisting={artifacts.length > 0}
        />
      </section>

      <p className="text-xs text-neutral-500">
        Bill Check is a software tool, not a law firm. Nothing here is legal
        advice, and no attorney-client relationship is created by using it.
      </p>
    </main>
  );
}
