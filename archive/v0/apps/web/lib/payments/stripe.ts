import Stripe from "stripe";

/**
 * Stripe client (U14, security #6). ENV-GUARDED: returns null when
 * STRIPE_SECRET_KEY is absent, so the whole PWYW surface is inert until
 * Pedro supplies test keys — the resolution loop still works (state actions,
 * verified-savings diff), only the tip checkout is gated.
 *
 * Stripe is OUTSIDE any future BAA: Checkout Session metadata carries an
 * opaque case UUID ONLY — never PHI, never a name, never bill contents.
 */

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key, { apiVersion: "2026-05-27.dahlia" }) : null;
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Server-enforced PWYW bounds (security #6): client amounts are clamped, never trusted. */
export const PWYW_MIN_CENTS = 0;
export const PWYW_MAX_CENTS = 500_00;
