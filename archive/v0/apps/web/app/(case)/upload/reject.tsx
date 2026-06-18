/**
 * S2b — graceful reject / redirect panel (plan U4, flow finding #3).
 * Rendered inline on the upload page when the FIRST classified document is
 * not a bill, and as re-shoot guidance when quality is blurry/partial.
 * Copy never scolds: every non-bill kind has a "keep it" framing where the
 * document is genuinely useful later.
 */

const KIND_COPY: Record<string, { title: string; body: string; keep: boolean }> = {
  eob: {
    title: "This looks like an EOB, not the bill",
    body:
      "An Explanation of Benefits says “this is not a bill” — and it isn’t. " +
      "Keep it: it makes your audit much stronger. But we need the bill itself " +
      "to run the checks, so add the statement that asks you to pay.",
    keep: true,
  },
  receipt: {
    title: "This looks like a payment receipt",
    body:
      "Useful — it proves what you’ve already paid, and we check that against " +
      "the bill’s credits. Keep it, and add the bill itself so we have charges " +
      "to audit.",
    keep: true,
  },
  gfe: {
    title: "This looks like a Good Faith Estimate",
    body:
      "Keep it — we compare estimates against what you were actually billed, " +
      "and a big gap is a real lever. Now add the bill itself.",
    keep: true,
  },
  collection_notice: {
    title: "This looks like a collection notice",
    body:
      "That’s important — keep it, and don’t ignore it. We’ll use it later. " +
      "Right now, add the medical bill it refers to so we can audit the " +
      "underlying charges.",
    keep: true,
  },
  other: {
    title: "This doesn’t look like a medical bill",
    body:
      "Photograph the statement that shows charges: the provider or hospital " +
      "name, dates of service, and dollar amounts. Lay it flat, fill the " +
      "frame, avoid glare — a kitchen table in daylight works great.",
    keep: false,
  },
};

const QUALITY_COPY: Record<string, string> = {
  blurry:
    "The photo is too blurry to read reliably. Re-shoot in good light, hold " +
    "the phone steady, and fill the frame with the page.",
  partial:
    "Part of the page is cut off. Re-shoot with the whole page in frame, " +
    "including the edges — totals and account numbers love to hide there.",
};

export function RejectPanel({ kind }: { kind: string }) {
  const copy = KIND_COPY[kind] ?? KIND_COPY.other;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
    >
      <p className="font-semibold text-amber-900 dark:text-amber-100">{copy.title}</p>
      <p className="text-sm text-amber-900/90 dark:text-amber-100/90">{copy.body}</p>
      {copy.keep ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          We kept this document on your case — no need to upload it again.
        </p>
      ) : null}
    </div>
  );
}

export function QualityPanel({ quality }: { quality: string }) {
  const copy = QUALITY_COPY[quality];
  if (!copy) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      {copy}
    </div>
  );
}
