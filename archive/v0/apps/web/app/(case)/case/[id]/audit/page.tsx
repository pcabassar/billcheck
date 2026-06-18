import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * S10 — what we checked (plan U12). Renders the persisted coverage map for
 * the case's current run: ran / skipped (with the honest reason + what
 * unlocks it) / not yet available. The anti-overclaim screen — a user should
 * never believe we checked more than we did.
 */

interface CoverageRow {
  checkId: string;
  status: "ran" | "skipped_no_data" | "not_yet_available";
  reason: string | null;
}

const CHECK_LABELS: Record<string, string> = {
  C1: "Balance billing vs your EOB",
  C2: "Was insurance billed at all?",
  C3: "Duplicate charges",
  C4: "Unbundled procedure pairs (NCCI)",
  C5: "Implausible units (MUE)",
  C6: "Denial codes that aren't your liability",
  C7: "Timely filing",
  C8: "Bill vs your Good Faith Estimate",
  C9: "Financial-assistance eligibility",
  C10: "Prices vs the Medicare benchmark",
  C11: "Services your records don't support",
  C12: "Upcoding patterns",
  C13: "Payments credited correctly",
};

const STATUS_BADGE: Record<CoverageRow["status"], { label: string; cls: string }> = {
  ran: { label: "Checked", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  skipped_no_data: { label: "Needs more info", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  not_yet_available: { label: "Coming soon", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

export default async function AuditCoveragePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, current_run_id")
    .eq("id", id)
    .maybeSingle();
  if (!caseRow) notFound();

  let coverage: CoverageRow[] = [];
  if (caseRow.current_run_id) {
    const { data: run } = await supabase
      .from("engine_runs")
      .select("coverage, engine_version, ref_version_map, completed_at")
      .eq("id", caseRow.current_run_id)
      .maybeSingle();
    coverage = ((run?.coverage ?? []) as CoverageRow[]);
  }

  const ran = coverage.filter((c) => c.status === "ran").length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">What we checked</h1>
        <p className="text-neutral-500">
          {coverage.length === 0
            ? "The audit hasn't run yet."
            : `${ran} of ${coverage.length} checks ran on this bill. The rest tell you exactly what they're waiting for — honesty over impressiveness.`}
        </p>
      </header>

      {coverage.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {coverage.map((c) => {
            const badge = STATUS_BADGE[c.status];
            return (
              <li
                key={c.checkId}
                className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">
                    {CHECK_LABELS[c.checkId] ?? c.checkId}
                  </p>
                  {c.status === "skipped_no_data" && c.reason ? (
                    <p className="text-xs text-neutral-500">{c.reason}</p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <footer className="flex justify-end">
        <Link
          href={`/case/${id}/verdict`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Back to your verdict
        </Link>
      </footer>
    </main>
  );
}
