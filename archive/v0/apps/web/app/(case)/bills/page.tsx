import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CaseActions } from "./case-actions";

/**
 * My bills (plan U3 / spec S14-lite): list of the user's cases with status
 * chips and state-conditional actions (U14): I sent it / tell us what
 * happened / add document / verify savings / close — so cases never dead-end.
 */

const STATE_LABELS: Record<string, string> = {
  CAPTURED: "Reading your bill",
  TRIAGED: "Questions answered",
  AUDITED: "Checks complete",
  VERDICT: "Verdict ready",
  WAITING_ADJUDICATION: "Waiting on your insurer",
  WAITING_ITEMIZED: "Waiting on the itemized bill",
  SENT_BY_USER: "Letter sent — awaiting reply",
  RESOLVED_SELF_REPORTED: "Resolved (you told us)",
  RESOLVED_VERIFIED: "Resolved — savings verified",
  CLOSED_BY_USER: "Closed",
};

export default async function BillsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: cases } = await supabase
    .from("cases")
    .select("id, state, primary_verdict, created_at, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Your bills</h1>
        <a
          href="/upload"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Check a new bill
        </a>
      </header>

      {!cases || cases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          No bills yet. Upload one and we&apos;ll run it through every check we
          have — free.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cases.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between gap-3">
                <Link href={`/case/${c.id}/plan`} className="flex flex-col hover:underline">
                  <span className="font-medium">
                    Case {c.id.slice(0, 8)}
                    {c.primary_verdict ? ` — ${c.primary_verdict}` : ""}
                  </span>
                  <span className="text-sm text-neutral-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </Link>
                <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  {STATE_LABELS[c.state] ?? c.state}
                </span>
              </div>
              <CaseActions caseId={c.id} state={c.state} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
