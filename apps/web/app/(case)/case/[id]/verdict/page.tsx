import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VerdictWait } from "../plan/verdict-wait";

/**
 * S11 — the verdict (plan U12). One screen, variant copy per primary verdict
 * (S11b PAY, S11c CLEAN_PARTIAL, S11d APPEAL handoff, S11e REJECT). Renders
 * the router's primary + rationale + deadline-ordered tracks + unlock list —
 * all deterministic data; nothing here is generated.
 */

interface Track {
  kind: string;
  reason: string;
  deadlineNote: string | null;
}

const VERDICT_COPY: Record<string, { headline: string; tone: string; sub: string }> = {
  REJECT: {
    headline: "Don't pay this bill as-is",
    tone: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100",
    sub: "Its premise is wrong: documented payments aren't credited. Demand a corrected statement first.",
  },
  WAIT: {
    headline: "Don't pay yet — wait for your insurance",
    tone: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100",
    sub: "The EOB decides what you actually owe. Anything you pay now is a guess.",
  },
  VALIDATE: {
    headline: "Demand validation from the collector first",
    tone: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100",
    sub: "A 30-day federal clock is running. Validation pauses collection while they prove the debt.",
  },
  APPEAL: {
    headline: "Appeal the denial — that's the big lever",
    tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
    sub: "A reversed denial usually moves more dollars than any line-item dispute.",
  },
  CONTEST: {
    headline: "Contest this bill",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100",
    sub: "The audit found specific, citable problems. Your dispute letter is ready to generate.",
  },
  REDUCE: {
    headline: "Apply for financial assistance",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100",
    sub: "The hospital's own published policy likely covers you. This works even when the bill is accurate.",
  },
  NEGOTIATE: {
    headline: "Negotiate — the prices are your leverage",
    tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
    sub: "No billing errors, but the charges run far above the Medicare benchmark. That's a negotiation, not a bill you just pay.",
  },
  PAY: {
    headline: "This bill held up",
    tone: "border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
    sub: "Every core check ran and found nothing to dispute. If you pay, you're paying a clean bill.",
  },
  GET_ITEMIZED: {
    headline: "Get the itemized bill first",
    tone: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100",
    sub: "This summary hides the codes and line charges a real audit needs. The itemized version is free and yours by right.",
  },
  CLEAN_PARTIAL: {
    headline: "No issues in what we could check — so far",
    tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
    sub: "That is not the same as a clean bill. Here's what would unlock the rest of the audit.",
  },
};

export default async function VerdictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state, primary_verdict, current_run_id")
    .eq("id", id)
    .maybeSingle();
  if (!caseRow) notFound();

  if (caseRow.state !== "VERDICT" || !caseRow.primary_verdict) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <h1 className="text-2xl font-bold">Your verdict</h1>
        <VerdictWait caseId={id} />
      </main>
    );
  }

  const { data: verdict } = await supabase
    .from("verdicts")
    .select("primary_verdict, stacked, coverage_map, created_at")
    .eq("case_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: findings } = caseRow.current_run_id
    ? await supabase
        .from("findings")
        .select("id, title, amount_impact_cents, confidence_tier")
        .eq("run_id", caseRow.current_run_id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const primary = caseRow.primary_verdict as string;
  const copy = VERDICT_COPY[primary] ?? VERDICT_COPY.CLEAN_PARTIAL;
  const tracks = ((verdict?.stacked ?? []) as Track[]);
  const meta = (verdict?.coverage_map ?? {}) as { rationale?: string[]; unlocks?: string[] };
  const disputedCents = (findings ?? []).reduce(
    (sum, f) => sum + (f.amount_impact_cents === null ? 0 : Number(f.amount_impact_cents)),
    0,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Your verdict</h1>
      </header>

      <div className={`rounded-lg border p-5 ${copy.tone}`}>
        <p className="text-lg font-bold">{copy.headline}</p>
        <p className="mt-1 text-sm">{copy.sub}</p>
        {disputedCents > 0 && (primary === "CONTEST" || primary === "REJECT") ? (
          <p className="mt-2 text-2xl font-bold">{formatCents(disputedCents)} in dispute</p>
        ) : null}
      </div>

      {(meta.rationale ?? []).length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Why
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
            {(meta.rationale ?? []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tracks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Also on your plan — in deadline order
          </h2>
          {tracks.map((t, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <p className="font-medium">{t.kind}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.reason}</p>
              {t.deadlineNote ? (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  ⏱ {t.deadlineNote}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {(meta.unlocks ?? []).length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">What would unlock more checks</h2>
          <ul className="list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {(meta.unlocks ?? []).map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex items-center justify-between">
        <Link
          href={`/case/${id}/audit`}
          className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          What we checked
        </Link>
        <Link
          href={`/case/${id}/plan`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          See your action plan
        </Link>
      </footer>
    </main>
  );
}
