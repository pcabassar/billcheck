import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@billcheck/shared";

/**
 * Per-user sliding-window upload rate limit (plan U4, security #5).
 *
 * Implementation: count of `documents` rows created by this user in the last
 * hour (joined through `cases` for ownership) — no extra table needed; every
 * accepted upload IS a documents row, and invalid files are rejected before
 * they ever reach storage or the LLM, so they cost nothing worth metering.
 *
 * Caller passes the ADMIN client (service-role) so the count is authoritative
 * and independent of the requester's RLS context; the explicit user filter
 * scopes it. A user-scoped client also works (RLS narrows to own rows).
 *
 * Out of scope this batch (seam): LLM spend alarm + per-IP challenge — the
 * per-account limit suffices while every AI action is login-gated pre-launch.
 */

export const UPLOADS_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function checkUploadRateLimit(
  client: SupabaseClient,
  userId: string,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await client
    .from("documents")
    .select("id, cases!inner(user_id)", { count: "exact", head: true })
    .eq("cases.user_id", userId)
    .gte("created_at", since);

  if (error) {
    // Fail CLOSED: this guards an unauthenticated-adjacent LLM cost surface.
    logError("upload.rate_limit.count_failed", error, { route: "/api/documents" });
    return { allowed: false, count: -1, limit: UPLOADS_PER_HOUR };
  }

  const used = count ?? 0;
  return { allowed: used < UPLOADS_PER_HOUR, count: used, limit: UPLOADS_PER_HOUR };
}
