import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, PWYW_MAX_CENTS, PWYW_MIN_CENTS } from "@/lib/payments/stripe";

/**
 * POST /api/cases/[id]/checkout — create a PWYW tip Checkout Session (U14,
 * security #6).
 *
 * Server enforces the bounds and sets the metadata; the client amount is
 * clamped, never trusted. Metadata carries the opaque case UUID ONLY (Stripe
 * is outside any future BAA). A completed payment is recorded ONLY by the
 * signature-verified webhook — the success redirect never marks anything paid.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  let body: { amountCents?: unknown };
  try {
    body = (await request.json()) as { amountCents?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = typeof body.amountCents === "number" ? Math.round(body.amountCents) : NaN;
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  // Clamp into bounds rather than reject — a $0 tip is allowed (prosocial PWYW).
  const amountCents = Math.max(PWYW_MIN_CENTS, Math.min(PWYW_MAX_CENTS, raw));
  if (amountCents === 0) {
    // No charge to process — treat as a graceful "thanks anyway".
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Ownership under RLS: a case the user can't see returns nothing.
  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "billcheck — thank-you tip" },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      // Opaque case UUID only — no PHI ever reaches Stripe.
      metadata: { caseId },
      success_url: `${origin}/case/${caseId}/outcome?tip=thanks`,
      cancel_url: `${origin}/case/${caseId}/outcome?tip=cancel`,
    });
    log("payments.checkout.created", { caseId, route: "/api/cases/[id]/checkout" });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logError("payments.checkout.failed", err, { caseId, route: "/api/cases/[id]/checkout" });
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
