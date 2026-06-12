import Link from "next/link";
import { notFound } from "next/navigation";
import { LETTER_FACT_ATTESTATION } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApprovalPanel } from "./approval-panel";

/**
 * S13 — letter view (plan U9). Print-friendly rendering (the browser's print
 * dialog IS the V0 PDF: everything except the letter carries print:hidden),
 * the fact-attestation approval block, and the closure panel.
 */

const RESPONSE_WINDOW_DAYS = 30;

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string; artifactId: string }>;
}) {
  const { id, artifactId } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS-scoped read: invisible artifacts (someone else's, or nonexistent) 404.
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, case_id, type, content, approved_at, created_at")
    .eq("id", artifactId)
    .eq("case_id", id)
    .maybeSingle();
  if (!artifact) notFound();

  const content = artifact.content as
    | { letterText?: unknown; generatedAt?: unknown }
    | null;
  const letterText =
    content && typeof content.letterText === "string" ? content.letterText : null;
  if (!letterText) notFound();

  const generatedAt =
    content && typeof content.generatedAt === "string"
      ? content.generatedAt
      : artifact.created_at;
  const replyBy = new Date(
    new Date(generatedAt).getTime() + RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12 print:max-w-none print:gap-0 print:p-0">
      <header className="flex flex-col gap-1 print:hidden">
        <Link
          href={`/case/${artifact.case_id}/plan`}
          className="text-sm text-neutral-500 hover:underline"
        >
          &larr; Back to your action plan
        </Link>
        <h1 className="text-2xl font-bold">Your dispute letter</h1>
        <p className="text-sm text-neutral-500">
          Read every line. You&apos;re confirming these facts as your own before
          anything is sent.
        </p>
      </header>

      <section
        aria-label="Letter"
        className="rounded-lg border border-neutral-200 bg-white p-8 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 print:border-0 print:bg-white print:p-0 print:text-black"
      >
        <pre className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
          {letterText}
        </pre>
      </section>

      <div className="print:hidden">
        <ApprovalPanel
          artifactId={artifact.id}
          letterText={letterText}
          attestationText={LETTER_FACT_ATTESTATION}
          initiallyApproved={Boolean(artifact.approved_at)}
        />
      </div>

      <section
        aria-label="What happens next"
        className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800 print:hidden"
      >
        <h2 className="text-lg font-semibold">What happens next</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Mail it
            </span>{" "}
            — print the approved letter and send it to the billing address on
            your statement. Certified mail gives you a delivery receipt.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Or use their portal
            </span>{" "}
            — most providers accept billing disputes through their patient
            portal. Paste the letter text into a billing message and keep a copy.
          </li>
          <li>
            Expect a reply by about{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {replyBy}
            </span>
            . The letter requests a written response within {RESPONSE_WINDOW_DAYS}{" "}
            days.
          </li>
          <li>
            Come back and tell us what happened. If you receive a corrected
            statement, upload it — we&apos;ll verify your savings against the
            original bill.
          </li>
        </ul>
      </section>

      <p className="text-xs text-neutral-500 print:hidden">
        Bill Check is a software tool, not a law firm. Nothing here is legal
        advice, and no attorney-client relationship is created by using it.
      </p>
    </main>
  );
}
