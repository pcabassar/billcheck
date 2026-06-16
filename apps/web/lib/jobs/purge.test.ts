import { describe, expect, it, vi } from "vitest";
import { purgeAnonymousData, PURGE_BATCH_CAP, type PurgeDeps } from "./purge";

const NOW = Date.UTC(2026, 6, 1);

function deps(over: Partial<PurgeDeps> = {}): PurgeDeps {
  return {
    selectPurgeableUsers: vi.fn(async () => ["u1"]),
    storagePathsForUser: vi.fn(async () => ["u1/doc-a", "u1/doc-b"]),
    removeObjects: vi.fn(async () => {}),
    purgeUserRows: vi.fn(async () => 1),
    deleteAuthUser: vi.fn(async () => {}),
    ...over,
  };
}

describe("purgeAnonymousData", () => {
  it("processes a user in order: paths → remove bytes → purge rows → delete auth user", async () => {
    const calls: string[] = [];
    const d = deps({
      storagePathsForUser: vi.fn(async () => {
        calls.push("paths");
        return ["k1"];
      }),
      removeObjects: vi.fn(async () => {
        calls.push("remove");
      }),
      purgeUserRows: vi.fn(async () => {
        calls.push("rows");
        return 2;
      }),
      deleteAuthUser: vi.fn(async () => {
        calls.push("auth");
      }),
    });
    const res = await purgeAnonymousData(d, NOW);
    // Bytes MUST go before rows (row deletion loses the storage_path refs);
    // the auth user goes last (case-less ⇒ nothing cascades into the trigger).
    expect(calls).toEqual(["paths", "remove", "rows", "auth"]);
    expect(res).toMatchObject({ purgedUsers: 1, purgedObjects: 1, purgedCases: 2, failures: 0 });
  });

  it("computes the cutoff from the retention window", async () => {
    const select = vi.fn(async () => []);
    await purgeAnonymousData(deps({ selectPurgeableUsers: select }), NOW, 30);
    const cutoff = (select.mock.calls[0] as unknown as [string, number])[0];
    expect(cutoff).toBe(new Date(NOW - 30 * 86400_000).toISOString());
  });

  it("skips the storage delete when a user has no documents", async () => {
    const remove = vi.fn(async () => {});
    await purgeAnonymousData(deps({ storagePathsForUser: vi.fn(async () => []), removeObjects: remove }), NOW);
    expect(remove).not.toHaveBeenCalled();
  });

  it("isolates one user's failure — the batch continues, failure counted", async () => {
    const users = ["good1", "bad", "good2"];
    const deleteAuthUser = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("boom");
    });
    const res = await purgeAnonymousData(
      deps({ selectPurgeableUsers: vi.fn(async () => users), deleteAuthUser }),
      NOW,
    );
    expect(res.purgedUsers).toBe(2);
    expect(res.failures).toBe(1);
    expect(deleteAuthUser).toHaveBeenCalledTimes(3);
  });

  it("a storage-removal failure stops THAT user before any row deletion (no orphaned bytes)", async () => {
    const purgeUserRows = vi.fn(async () => 1);
    const res = await purgeAnonymousData(
      deps({
        removeObjects: vi.fn(async () => {
          throw new Error("storage down");
        }),
        purgeUserRows,
      }),
      NOW,
    );
    expect(purgeUserRows).not.toHaveBeenCalled(); // never delete rows if bytes survive
    expect(res.failures).toBe(1);
    expect(res.purgedUsers).toBe(0);
  });

  it("partial=true exactly when a full batch came back", async () => {
    const full = Array.from({ length: PURGE_BATCH_CAP }, (_, i) => `u${i}`);
    const a = await purgeAnonymousData(deps({ selectPurgeableUsers: vi.fn(async () => full) }), NOW);
    expect(a.partial).toBe(true);
    const b = await purgeAnonymousData(deps({ selectPurgeableUsers: vi.fn(async () => ["u1"]) }), NOW);
    expect(b.partial).toBe(false);
  });

  it("empty batch → all zeros, not partial", async () => {
    const res = await purgeAnonymousData(deps({ selectPurgeableUsers: vi.fn(async () => []) }), NOW);
    expect(res).toEqual({ purgedUsers: 0, purgedCases: 0, purgedObjects: 0, failures: 0, partial: false });
  });
});
