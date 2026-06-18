import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCaseBundle } from "@/lib/case/queries";
import { isParsePending } from "@/lib/case/rules";
import { TriageForm } from "./triage-form";

/**
 * S4 — triage (plan U10): a handful of coverage questions between the
 * confirm review and the audit. Answers set routing flags; the audit (or the
 * S5 wait screen) follows from the form's submit.
 */
export default async function TriagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const bundle = await getCaseBundle(supabase, id);
  if (!bundle) notFound();

  const { caseRow, documents } = bundle;
  if (documents.some((d) => isParsePending(d.parse_status))) {
    redirect(`/case/${id}/confirm`);
  }
  // Already audited → answers are baked; send the user forward.
  if (!["CAPTURED", "TRIAGED", "WAITING_ADJUDICATION", "WAITING_ITEMIZED"].includes(caseRow.state)) {
    redirect(`/case/${id}/decode`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">A few quick questions</h1>
        <p className="text-neutral-500">
          Your answers decide which checks we can run and which protections
          apply. Takes under a minute.
        </p>
      </header>
      <TriageForm caseId={id} />
    </main>
  );
}
