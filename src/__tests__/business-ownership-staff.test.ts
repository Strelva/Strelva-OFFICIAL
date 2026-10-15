import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inviteBusinessOwner, setBusinessOwnershipDb } from "@/platform/workspaces/business-ownership";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { setOperatorApprovalsDb } from "@/platform/workspaces/operator-approvals";

// An operator cannot invite staff as a business's owner (#524). Fictional data; no mail.

const WS = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR = { userId: OPERATOR_ID, verifiedEmail: "ops@strelva.example" };
const state = {
  workspaceId: WS, workspaceName: "Great Lakes Dried Fruit", operatorId: OPERATOR_ID, hasOwner: false, exited: false,
  recipient: { email: "ruth@gldf.example", name: "Ruth", from: "record", source: "tenant_import", verified: false, tenantId: null },
  tenants: [], pending: [],
};

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
let staff: { data: unknown; error: { message: string } | null };
beforeEach(() => {
  staff = { data: "platform_operator", error: null };
  rpc = vi.fn<Rpc>(async name => {
    if (name === "read_operator_owner_invitation_state") return { data: state, error: null };
    if (name === "owner_contact_staff_reason") return staff;
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  const approvals = vi.fn<Rpc>(async () => ({ data: null, error: { message: "approvals must not be reached" } }));
  setBusinessOwnershipDb({ rpc });
  setOperatorApprovalsDb({ rpc: approvals });
});
afterEach(() => { setBusinessOwnershipDb(null); setOperatorApprovalsDb(null); });

describe("inviteBusinessOwner and staff addresses", () => {
  it("refuses a staff address before any approval or invitation", async () => {
    const now = new Date("2026-10-06T12:00:00Z");
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: now.getTime() / 1000, now: () => now })).rejects.toThrow(WorkspaceConflictError);
    expect(rpc).toHaveBeenCalledWith("owner_contact_staff_reason", { p_customer_workspace_id: WS, p_email: "ruth@gldf.example" });
    expect(rpc).not.toHaveBeenCalledWith("create_operator_owner_invitation_approved", expect.anything());
  });

  it("holds when the check itself fails", async () => {
    staff = { data: null, error: { message: "down" } };
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: null, approvalId: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow(WorkspaceStoreError);
    expect(rpc).not.toHaveBeenCalledWith("create_operator_owner_invitation_approved", expect.anything());
  });
});
