import { afterEach, describe, expect, it, vi } from "vitest";
import { projectQueue } from "@/platform/operator-queue/project";
import { listingReadbackItems, readListingReadbackSource } from "@/platform/operator-queue/sources";
import { readListingReadbackFailures, setOperatorQueueDb, type ListingReadbackFailure } from "@/platform/operator-queue/store";

/**
 * /admin/queue reads Google listing writes whose read-back failed from
 * google_listing_receipts, the one ledger those writes record in. A read
 * failure is a named gap, never an empty list.
 */

const ACTOR = { userId: "0a900000-0000-4000-8000-000000000001", verifiedEmail: "Operator@example.test" };
const NOW = Date.parse("2026-10-08T12:00:00Z");

const failureRow = (over: Partial<ListingReadbackFailure> = {}): ListingReadbackFailure => ({
  id: "1c900000-0000-4000-8000-0000000000aa",
  workspaceId: "1c900000-0000-4000-8000-000000000010",
  workspaceName: "The Mooney Firm",
  tenantId: "mooney",
  action: "reply_post",
  targetRef: "rev_9",
  status: "posted_unverified",
  readback: "failed",
  error: null,
  createdAt: "2026-10-08T10:00:00Z",
  completedAt: "2026-10-08T10:00:02Z",
  ...over,
});

afterEach(() => setOperatorQueueDb(null));

describe("listing read-back failures in the operator queue", () => {
  it("maps each receipt to a readback_failed item keyed apart from outside-write receipts", () => {
    const [item] = listingReadbackItems([failureRow()]);
    expect(item).toEqual({
      kind: "readback_failed", sourceRef: "listing:1c900000-0000-4000-8000-0000000000aa", tenantId: "mooney",
      workspaceId: "1c900000-0000-4000-8000-000000000010",
      title: "Google review reply for The Mooney Firm: accepted, read-back failed",
      openedAt: "2026-10-08T10:00:02Z", receiptIds: ["1c900000-0000-4000-8000-0000000000aa"], href: "/admin/clients/mooney#receipts",
    });
  });

  it("projects as P1 on the Strelva side and is never re-sent", () => {
    const queue = projectQueue({
      reads: [{ kind: "readback_failed", source: "Google listing receipts", ok: true, rows: listingReadbackItems([failureRow({ tenantId: null })]) }],
      context: null, contextFailure: "test", tenants: [], emailPaused: true, now: NOW,
    });
    const item = queue.items.find((entry) => entry.kind === "readback_failed");
    expect(item?.priority).toBe("P1");
    expect(item?.priorityReason).toMatch(/Never re-sent/);
    expect(item?.move).toBe("strelva");
  });

  it("reads through the operator-checked RPC and parses the rows", async () => {
    const rpc = vi.fn(async () => ({ data: [failureRow()], error: null }));
    setOperatorQueueDb({ rpc });
    const rows = await readListingReadbackFailures(ACTOR, 50);
    expect(rows).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("read_audited_platform_operator_detail", {
      p_reader_name: "read_google_listing_readback_failures",
      p_user_id: ACTOR.userId, p_verified_email: "operator@example.test", p_limit: 50,
    });
  });

  it("a non-operator is refused and a storage failure becomes a named gap", async () => {
    setOperatorQueueDb({ rpc: async () => ({ data: null, error: { message: "operator_queue_access_denied" } }) });
    await expect(readListingReadbackFailures(ACTOR)).rejects.toThrow(/operator/i);
    setOperatorQueueDb({ rpc: async () => ({ data: null, error: { message: "connection refused" } }) });
    const read = await readListingReadbackSource(ACTOR);
    expect(read).toMatchObject({ kind: "readback_failed", source: "Google listing receipts", ok: false });
  });

  it("a malformed row is unavailable, never a shorter list", async () => {
    setOperatorQueueDb({ rpc: async () => ({ data: [{ ...failureRow(), status: "posted" }], error: null }) });
    const read = await readListingReadbackSource(ACTOR);
    expect(read.ok).toBe(false);
  });
});
