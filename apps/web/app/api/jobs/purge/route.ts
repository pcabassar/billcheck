import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { purgeAnonymousData, type PurgeDeps } from "@/lib/jobs/purge";

/**
 * Anonymous-data purge (plan U17, R8 / data #3). pg_cron → pg_net → here
 * (service role). The orchestration + batch/failure semantics live in
 * `lib/jobs/purge.ts` (unit-tested); this route only wires the real Supabase
 * admin client and gates on CRON_SECRET (public-path in middleware).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const deps: PurgeDeps = {
    async selectPurgeableUsers(cutoffIso, limit) {
      const { data, error } = await admin.rpc("select_purgeable_anon_users", {
        p_cutoff: cutoffIso,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    },
    async storagePathsForUser(userId) {
      const { data, error } = await admin.rpc("storage_paths_for_user", { p_user_id: userId });
      if (error) throw error;
      return ((data ?? []) as Array<{ storage_path: string }>).map((r) => r.storage_path);
    },
    async removeObjects(keys) {
      const { error } = await admin.storage.from("documents").remove(keys);
      if (error) throw error;
    },
    async purgeUserRows(userId) {
      const { data, error } = await admin.rpc("purge_anonymous_user_rows", { p_user_id: userId });
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };

  try {
    const result = await purgeAnonymousData(deps, Date.now());
    return NextResponse.json(result);
  } catch (err) {
    logError("purge.batch_failed", err, { route: "/api/jobs/purge" });
    return NextResponse.json({ error: "purge_failed" }, { status: 500 });
  }
}
