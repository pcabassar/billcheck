"use client";

import { useState } from "react";
import { formatCents } from "@billcheck/shared";

/**
 * PWYW panel (S16, Pedro's monetization decision):
 *  - anchored: document-verified savings → suggested ≈10%, "$X saved" framing.
 *  - unanchored: self-reported win → a tip ask with NO dollar claim.
 * $0 is always allowed; the framing is prosocial, never a paywall.
 *
 * Inert without Stripe keys (server returns 503 / payments_not_configured) —
 * the panel shows a graceful "coming soon" instead of a broken checkout.
 */
export function PwywPanel({
  caseId,
  savingsCents,
  suggestedCents,
}: {
  caseId: string;
  /** Verified savings (anchored) or null (unanchored self-report). */
  savingsCents: number | null;
  /** Anchored suggestion, or a flat default for the unanchored ask. */
  suggestedCents: number;
}) {
  const [amountCents, setAmountCents] = useState(suggestedCents);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const anchored = savingsCents !== null;

  async function tip() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const body = (await res.json().catch(() => null)) as
        | { url?: string; skipped?: boolean; error?: string }
        | null;
      if (res.status === 503) {
        setMessage("Tipping isn't switched on yet — but thank you. Your support means a lot.");
        setPending(false);
        return;
      }
      if (body?.skipped) {
        setMessage("No worries — thank you for using billcheck. Spread the word if it helped.");
        setPending(false);
        return;
      }
      if (!res.ok || !body?.url) {
        setMessage("We couldn't open checkout just now — try again in a moment.");
        setPending(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setMessage("Network hiccup — try again.");
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
          {anchored ? "You saved real money" : "Glad it worked out"}
        </h2>
        <p className="text-sm text-emerald-900/90 dark:text-emerald-100/90">
          {anchored
            ? `We verified ${formatCents(savingsCents)} in savings against your original bill. billcheck is pay-what-you-want — if it earned a tip, name your price. $0 is genuinely fine.`
            : "billcheck is pay-what-you-want and free to use. If it helped, a tip keeps it running and free for the next person. Totally optional."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="tip" className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Your tip
          </label>
          <span className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            {formatCents(amountCents)}
          </span>
        </div>
        <input
          id="tip"
          type="range"
          min={0}
          max={Math.max(suggestedCents * 3, 5000)}
          step={100}
          value={amountCents}
          onChange={(e) => setAmountCents(Number(e.target.value))}
          className="w-full accent-emerald-600"
        />
        {anchored ? (
          <p className="text-xs text-emerald-900/70 dark:text-emerald-100/70">
            Suggested: {formatCents(suggestedCents)} (about 10% of what you saved).
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => void tip()}
        className="self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Opening…" : amountCents === 0 ? "Continue" : `Tip ${formatCents(amountCents)}`}
      </button>
      {message ? (
        <p className="text-sm text-emerald-900 dark:text-emerald-100">{message}</p>
      ) : null}
    </section>
  );
}
