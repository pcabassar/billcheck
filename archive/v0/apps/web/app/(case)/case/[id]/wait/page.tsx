import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WaitActions } from "./wait-actions";

/**
 * S5 — the WAIT screen (plan U10): insured + pre-adjudication. Auditing a
 * bill before insurance processes it produces dishonest verdicts, so the
 * case parks in WAITING_ADJUDICATION with a one-shot reminder. Exits:
 *  - "My EOB arrived" → upload it (U16 arms C1/C2/C6), then audit.
 *  - "Audit anyway" → escape hatch, runs with degraded coverage.
 */
export default async function WaitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", id)
    .maybeSingle();
  if (!caseRow) notFound();

  const { data: deadline } = await supabase
    .from("deadlines")
    .select("due_at")
    .eq("case_id", id)
    .eq("type", "eob_wait_reminder")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dueDate = deadline?.due_at
    ? new Date(deadline.due_at as string).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Wait for your insurance first</h1>
        <p className="text-neutral-500">
          Don&apos;t pay this bill yet — your insurance hasn&apos;t processed
          it. Most of what we can check for an insured bill needs the EOB
          (Explanation of Benefits).
        </p>
      </header>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-medium">What happens now</p>
        <ul className="mt-1 list-disc pl-5">
          <li>Your insurance typically processes claims within 2–3 weeks.</li>
          <li>
            The EOB arrives by mail or in your insurer&apos;s portal — it shows
            what they allowed, paid, and what you actually owe.
          </li>
          {dueDate ? (
            <li>
              Check back around <span className="font-medium">{dueDate}</span>
              {" "}— we&apos;ve marked it on your case.
            </li>
          ) : null}
        </ul>
      </div>

      <WaitActions caseId={id} />

      <Link href="/bills" className="text-sm text-neutral-500 underline">
        Back to your bills
      </Link>
    </main>
  );
}
