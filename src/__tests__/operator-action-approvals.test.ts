import { afterEach, describe, expect, it, vi } from "vitest";
import { recordOperatorActionApproval, setOperatorApprovalsDb } from "@/platform/workspaces/operator-approvals";

const WS = "11111111-1111-4111-8111-111111111111";
const APPROVER = "33333333-3333-4333-8333-333333333333";
const APPROVAL = "55555555-5555-4555-8555-555555555555";

afterEach(() => setOperatorApprovalsDb(null));

describe("recordOperatorActionApproval", () => {
  it("records a normalized owner-invitation action under the authenticated approver", async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        approvalId: APPROVAL,
        workspaceId: args.p_workspace_id,
        actionKind: args.p_action_kind,
        target: args.p_target,
        approvedBy: APPROVER,
        approvedEmail: "approver@strelva.example",
        approvedAt: "2026-10-07T12:00:00.000Z",
        expiresAt: "2026-10-07T12:15:00.000Z",
      },
      error: null,
    }));
    setOperatorApprovalsDb({ rpc });

    const approval = await recordOperatorActionApproval({ userId: APPROVER, verifiedEmail: "Approver@Strelva.example" }, WS, {
      kind: "owner_invitation.issue", recipientEmail: " Owner@Client.example ", sendEmail: false,
    });

    expect(rpc).toHaveBeenCalledWith("create_operator_action_approval", {
      p_approver_user_id: APPROVER,
      p_workspace_id: WS,
      p_action_kind: "owner_invitation.issue",
      p_target: { recipientEmail: "owner@client.example", sendEmail: false },
      p_audit_context: { source: "web" },
    });
    expect(approval).toMatchObject({ approvalId: APPROVAL, approvedBy: APPROVER, actionKind: "owner_invitation.issue" });
  });
});
