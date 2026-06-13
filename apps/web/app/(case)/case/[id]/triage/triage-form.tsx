"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * S4 triage — conversational cards (U10). Every question allows "not sure";
 * answers route the case (WAIT / VALIDATE / APPEAL / REJECT premise / C8 / C9)
 * without ever blocking the audit on uncertainty.
 *
 * Submit saves answers, then either routes to the S5 wait screen or kicks
 * the audit and walks the user into decode — same idempotent kick as the
 * confirm screen used pre-U10.
 */

type Tri = "yes" | "no" | "not_sure";

interface Question {
  key: "insured" | "adjudicated" | "collections" | "denied" | "alreadyPaid" | "otherPayer" | "gfeReceived";
  title: string;
  detail: string;
  /** Render only when this predicate over current answers passes. */
  when?: (a: Answers) => boolean;
}

interface Answers {
  insured: Tri;
  adjudicated: Tri;
  collections: Tri;
  denied: Tri;
  alreadyPaid: Tri;
  otherPayer: Tri;
  gfeReceived: Tri;
  state: string | null;
  incomeBand: "under_2x_fpl" | "2x_to_4x_fpl" | "over_4x_fpl" | "skip" | null;
}

const QUESTIONS: Question[] = [
  {
    key: "insured",
    title: "Do you have health insurance that should cover this visit?",
    detail: "Employer plan, marketplace, Medicare, Medicaid — anything that should have applied.",
  },
  {
    key: "adjudicated",
    title: "Has your insurance already processed this bill?",
    detail: "You'd have an EOB (Explanation of Benefits) in the mail or portal, or the portal shows what they paid.",
    when: (a) => a.insured === "yes",
  },
  {
    key: "denied",
    title: "Did your insurance deny a claim for this visit?",
    detail: "A denial letter or an EOB showing $0 paid with a denial code.",
    when: (a) => a.insured === "yes",
  },
  {
    key: "gfeReceived",
    title: "Were you given a written cost estimate before care?",
    detail: "Self-pay patients are entitled to a Good Faith Estimate — a written quote before treatment.",
    when: (a) => a.insured === "no",
  },
  {
    key: "collections",
    title: "Is a collection agency contacting you about this bill?",
    detail: "Calls or letters from a company that isn't the hospital or clinic itself.",
  },
  {
    key: "alreadyPaid",
    title: "Have you already paid any of this bill?",
    detail: "Including payments at the front desk or a payment plan.",
  },
  {
    key: "otherPayer",
    title: "Could someone else's insurance owe for this?",
    detail: "Car accident, work injury, or another liable party.",
  },
];

const TRI_LABELS: Array<{ value: Tri; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
];

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

export function TriageForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({
    insured: "not_sure",
    adjudicated: "not_sure",
    collections: "not_sure",
    denied: "not_sure",
    alreadyPaid: "not_sure",
    otherPayer: "not_sure",
    gfeReceived: "not_sure",
    state: null,
    incomeBand: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      const body = (await res.json().catch(() => null)) as
        | { next?: string }
        | null;
      if (!res.ok) {
        setError("We couldn't save your answers — try again in a moment.");
        setSubmitting(false);
        return;
      }
      if (body?.next === "wait") {
        router.push(`/case/${caseId}/wait`);
        return;
      }
      // Kick the audit (idempotent; 409 means it already ran — move along).
      const kick = await fetch(`/api/cases/${caseId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      if (kick.ok || kick.status === 409) {
        router.push(`/case/${caseId}/decode`);
        return;
      }
      setError("Answers saved, but we couldn't start the audit — try again.");
      setSubmitting(false);
    } catch {
      setError("Network hiccup — check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {QUESTIONS.filter((q) => !q.when || q.when(answers)).map((q) => (
        <section
          key={q.key}
          className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">{q.title}</p>
            <p className="text-sm text-neutral-500">{q.detail}</p>
          </div>
          <div className="flex gap-2">
            {TRI_LABELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: opt.value }))}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  answers[q.key] === opt.value
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Which state was the care in?</p>
          <p className="text-sm text-neutral-500">
            Some protections are state-specific. Optional.
          </p>
        </div>
        <select
          value={answers.state ?? ""}
          onChange={(e) => setAnswers((a) => ({ ...a, state: e.target.value || null }))}
          className="w-40 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        >
          <option value="">Skip</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Roughly, your household income?</p>
          <p className="text-sm text-neutral-500">
            Only used to check hospital financial-assistance eligibility.
            Completely optional — skip freely.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "under_2x_fpl", label: "Lower income" },
              { value: "2x_to_4x_fpl", label: "Middle" },
              { value: "over_4x_fpl", label: "Higher" },
              { value: "skip", label: "Skip" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswers((a) => ({ ...a, incomeBand: opt.value }))}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                answers.incomeBand === opt.value
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void submit()}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
      <p className="text-center text-xs text-neutral-500">
&ldquo;Not sure&rdquo; is always fine — we&apos;ll work with what you know.
      </p>
    </div>
  );
}
