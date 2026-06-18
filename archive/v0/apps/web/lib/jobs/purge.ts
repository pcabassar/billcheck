import { log, logError } from "@billcheck/shared";

/**
 * Anonymous-data purge orchestration (plan U17), dependency-injected so the
 * order and failure-isolation are unit-testable without a live Supabase.
 * The route wires the real Supabase admin client; tests wire fakes.
 *
 * Per user, in order: collect storage keys → delete bytes → delete rows
 * (cascade, append-only bypass) → delete the auth user. One user's failure
 * is logged and skipped — it never aborts the batch, so a backlog drains.
 */
export interface PurgeDeps {
  /** Oldest-first anonymous user IDs past the retention cutoff (batch-capped). */
  selectPurgeableUsers: (cutoffIso: string, limit: number) => Promise<string[]>;
  /** Storage object keys owned by a user, collected before row deletion. */
  storagePathsForUser: (userId: string) => Promise<string[]>;
  /** Delete storage objects by key (idempotent). */
  removeObjects: (keys: string[]) => Promise<void>;
  /** Delete the user's rows under the append-only bypass; returns cases removed. */
  purgeUserRows: (userId: string) => Promise<number>;
  /** Delete the (now case-less) auth user. */
  deleteAuthUser: (userId: string) => Promise<void>;
}

export interface PurgeResult {
  purgedUsers: number;
  purgedCases: number;
  purgedObjects: number;
  failures: number;
  /** A full batch ran ⇒ more may remain for the next tick. */
  partial: boolean;
}

export const PURGE_RETENTION_DAYS = 30;
export const PURGE_BATCH_CAP = 50;

export async function purgeAnonymousData(
  deps: PurgeDeps,
  now: number,
  retentionDays = PURGE_RETENTION_DAYS,
  batchCap = PURGE_BATCH_CAP,
): Promise<PurgeResult> {
  const cutoffIso = new Date(now - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const users = await deps.selectPurgeableUsers(cutoffIso, batchCap);

  let purgedUsers = 0;
  let purgedCases = 0;
  let purgedObjects = 0;
  let failures = 0;

  for (const userId of users) {
    try {
      const keys = await deps.storagePathsForUser(userId);
      if (keys.length > 0) {
        await deps.removeObjects(keys);
        purgedObjects += keys.length;
      }
      purgedCases += await deps.purgeUserRows(userId);
      await deps.deleteAuthUser(userId);
      purgedUsers += 1;
    } catch (err) {
      failures += 1;
      logError("purge.user_failed", err, {});
    }
  }

  log("purge.done", { count: purgedUsers });
  return { purgedUsers, purgedCases, purgedObjects, failures, partial: users.length === batchCap };
}
