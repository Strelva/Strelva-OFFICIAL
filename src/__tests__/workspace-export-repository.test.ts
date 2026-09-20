import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

import { WorkspaceStoreError } from "@/platform/workspaces";
import { exportWorkspace } from "@/platform/workspace-exports/repository";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", verifiedEmail: "owner@example.test" };
const instant = "2026-09-20T00:00:00.000Z";

function baseExport(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    exportId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    exportedAt: instant,
    workspace: { id: workspaceId, name: "Export workspace", kind: "customer", createdAt: instant, updatedAt: instant },
    manifest: {
      scope: "current_workspace_portability_snapshot",
      included: [
        "workspace_identity", "saved_results", "native_application_releases", "native_application_records",
        "economics_authorizations", "economics_reservations", "economics_usage_receipts", "economics_execution_outcomes",
        "onboarding_cases", "onboarding_attachment_references", "workspace_exit_state",
      ],
      omitted: [
        "credentials", "provider_connection_data", "invitation_tokens", "agent_tokens", "idempotency_keys",
        "command_digests", "internal_product_learning", "operator_notes", "onboarding_raw_attachment_bytes", "deletion_and_retention_policy",
      ],
      unavailable: Array.from({ length: 9 }, (_, index) => ({ category: `category-${index}`, reason: "Not included in this portability snapshot." })),
      maximumBytes: 2_000_000,
      attachmentMaximumBytes: 2_000_000,
      maxAttachmentReferences: 500,
    },
    savedResults: [],
    nativeApplications: { releases: [], records: [] },
    onboarding: { cases: [], attachments: [] },
    lifecycle: { exit: null },
    economics: { jobs: [], reservations: [], usageReceipts: [], executionOutcomes: [] },
  };
}

function publicBookings() {
  return {
    grants: [{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      tenantStableId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      businessWorkspaceId: workspaceId,
      workId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      capabilityId: "consultations",
      capabilityVersion: 1,
      inquiryCapabilityId: "inquiries",
      inquiryVersion: 1,
      provider: "outlook",
      displayName: "Consultations",
      timeZone: "UTC",
      status: "published",
      revision: 1,
      publishedAt: instant,
      createdAt: instant,
      updatedAt: instant,
      revokedAt: null,
      revocationReason: null,
    }],
    receipts: [{
      reservationId: "11111111-1111-4111-8111-111111111111",
      grantId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      tenantId: "northstar",
      capabilityId: "consultations",
      version: 1,
      provider: "outlook",
      inquiryId: "inquiry-1",
      title: "Consultation",
      start: instant,
      end: "2026-09-20T01:00:00.000Z",
      timeZone: "UTC",
      status: "cancelled",
      createdAt: instant,
      updatedAt: instant,
    }],
  };
}

describe("workspace export public booking repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc
      .mockResolvedValueOnce({ data: baseExport(), error: null })
      .mockResolvedValueOnce({ data: publicBookings(), error: null });
  });

  it("includes only the versioned public grant and receipt projection", async () => {
    const result = await exportWorkspace(actor, workspaceId);
    expect(result.publicBookings).toEqual(publicBookings());
    expect(JSON.stringify(result.publicBookings)).not.toContain("managementToken");
    expect(JSON.stringify(result.publicBookings)).not.toContain("ciphertext");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "export_public_website_bookings", {
      p_workspace_id: workspaceId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
    });
  });

  it("rejects a public booking export that contains raw token state", async () => {
    const unsafe = publicBookings() as { grants: unknown[]; receipts: unknown[] };
    const firstReceipt = unsafe.receipts[0];
    if (!firstReceipt || typeof firstReceipt !== "object" || Array.isArray(firstReceipt)) throw new Error("Fixture receipt is missing.");
    unsafe.receipts = [{ ...firstReceipt, managementToken: "visitor-token" }];
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: baseExport(), error: null })
      .mockResolvedValueOnce({ data: unsafe, error: null });
    await expect(exportWorkspace(actor, workspaceId)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("does not turn an unavailable public booking RPC result into an empty success", async () => {
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: baseExport(), error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(exportWorkspace(actor, workspaceId)).rejects.toMatchObject({ message: "Public booking records did not match their export schema" });
  });

  it("surfaces a public booking RPC failure as an export storage error", async () => {
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: baseExport(), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });
    await expect(exportWorkspace(actor, workspaceId)).rejects.toMatchObject({ message: "Public booking records are unavailable for this export." });
  });
});
