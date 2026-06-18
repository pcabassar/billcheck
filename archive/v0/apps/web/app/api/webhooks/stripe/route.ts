import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { log, logError } from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/payments/stripe";

/**
 * POST /api/webhooks/stripe — the ONLY writer of `payments` rows (security
 * #6). Signature-verified against STRIPE_WEBHOOK_SECRET; the raw body is read
 * unparsed for verification. A row is written only on
 * `checkout.session.completed`, idempotent on the Stripe event ID
 * (payments.stripe_ref is unique → a replayed event is a no-op).
 *
 * Public path (middleware): Stripe is server-to-server, no session, no
 * matching Origin — the signature IS the authentication.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch {
    // Bad signature — never trust the payload. Constant response, no detail.
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge unrelated events so Stripe stops retrying them.
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const caseId = session.metadata?.caseId;
  const amountCents = session.amount_total;
  if (!caseId || typeof amountCents !== "number") {
    // Malformed for our purposes — ack to stop retries, but write nothing.
    log("payments.webhook.skipped", { route: "/api/webhooks/stripe" });
    return NextResponse.json({ received: true });
  }

  const admin = createSupabaseAdminClient();
  // Idempotent on the event ID: the unique constraint makes a replay a no-op.
  const { error } = await admin.from("payments").insert({
    case_id: caseId,
    kind: "pwyw",
    stripe_ref: event.id,
    amount_cents: amountCents,
    status: "completed",
  });
  if (error && error.code !== "23505") {
    // 23505 = duplicate (replayed event): expected, success. Anything else
    // is real — surface a 500 so Stripe retries.
    logError("payments.webhook.insert_failed", error, { route: "/api/webhooks/stripe" });
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  log("payments.webhook.recorded", { route: "/api/webhooks/stripe", caseId });
  return NextResponse.json({ received: true });
}
