import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: null as unknown,
}));

vi.mock("@/lib/db/client", () => ({
  getSupabase: () => mocks.client,
}));

import {
  assertInquiryWorkspaceOpen,
  InquiryWorkspaceExitBlockedError,
  resolveInquiryWorkspace,
} from "@/products/inquiries/workspace-exit";

const tenantStableId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customerWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const installationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("inquiry workspace exit authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client = { rpc: mocks.rpc };
  });

  it("resolves a tenant to the customer workspace behind its installed inquiry", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        workspace_id: customerWorkspaceId,
        installation_id: installationId,
        installation_status: "active",
        exit_completed: false,
      }],
      error: null,
    });

    await expect(resolveInquiryWorkspace({
      tenantId: "harbor-dental",
      tenantStableId,
      fallbackBusinessId: tenantStableId,
    })).resolves.toEqual({
      businessId: customerWorkspaceId,
      workspaceIds: [customerWorkspaceId],
      exitCompleted: false,
      mapped: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("read_inquiry_workspace_exit", { p_tenant_stable_id: tenantStableId });
  });

  it("blocks successor-named resources because completion ends new intake authority", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        workspace_id: customerWorkspaceId,
        installation_id: installationId,
        installation_status: "active",
        exit_completed: true,
      }],
      error: null,
    });

    await expect(assertInquiryWorkspaceOpen({ tenantId: "harbor-dental", tenantStableId })).rejects.toBeInstanceOf(InquiryWorkspaceExitBlockedError);
  });

  it("reports missing storage instead of treating an unverified exit state as unmapped", async () => {
    mocks.client = null;

    await expect(resolveInquiryWorkspace({
      tenantId: "harbor-dental",
      tenantStableId,
      fallbackBusinessId: tenantStableId,
    })).rejects.toMatchObject({ code: "inquiry_workspace_exit_unavailable" });
  });

  it("reports malformed authority rows instead of allowing future work", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        workspace_id: customerWorkspaceId,
        installation_id: installationId,
        installation_status: "active",
        exit_completed: "false",
      }],
      error: null,
    });

    await expect(resolveInquiryWorkspace({
      tenantId: "harbor-dental",
      tenantStableId,
      fallbackBusinessId: tenantStableId,
    })).rejects.toMatchObject({ code: "inquiry_workspace_exit_unavailable" });
  });

  it("keeps a tenant with no mapped inquiry offering on its legacy business identity", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(resolveInquiryWorkspace({
      tenantId: "uninstalled-site",
      tenantStableId,
      fallbackBusinessId: tenantStableId,
    })).resolves.toMatchObject({
      businessId: tenantStableId,
      workspaceIds: [],
      exitCompleted: false,
      mapped: false,
    });
  });
});
