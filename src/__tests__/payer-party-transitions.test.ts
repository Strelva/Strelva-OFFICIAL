import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));

import { commandPayerTransition, PayerTransitionValidationError } from "@/platform/work-economics/payer-transitions";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const agencyId = "22222222-2222-4222-8222-222222222222";

function transition(over: Record<string, unknown>) {
  return { id: "33333333-3333-4333-8333-333333333333", workspace_id: workspaceId, successor_user_id: null, successor_email: null,
    status: "pending", proposer_email: "owner@example.com", proposed_at: "2026-10-09T12:00:00Z", resolved_at: null, accepted_at: null, ...over };
}

// The payer is a party (20261009154000_payer_party.sql): an owner may propose
// an agency, or switch back to the business itself, through the same command.
describe("payer party commands", () => {
  beforeEach(() => rpc.mockReset());

  it("proposes an agency as payer and reads it back as a party", async () => {
    rpc.mockResolvedValueOnce({ data: [transition({ successor_kind: "agency", successor_workspace_id: agencyId })], error: null });
    rpc.mockResolvedValueOnce({ data: [transition({ successor_kind: "agency", successor_workspace_id: agencyId, successor_workspace_name: "Northside Web" })], error: null });
    const snapshot = await commandPayerTransition(actor, { action: "propose", workspaceId, successorAgencyWorkspaceId: agencyId });
    expect(rpc).toHaveBeenNthCalledWith(1, "workspace_payer_transition_command", {
      p_command: { action: "propose", workspaceId, successorAgencyWorkspaceId: agencyId }, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
    });
    expect(snapshot.pending).toMatchObject({ successorKind: "agency", successorWorkspaceId: agencyId, successorWorkspaceName: "Northside Web", successorUserId: "" });
  });

  it("proposes the business itself", async () => {
    rpc.mockResolvedValue({ data: [transition({ successor_kind: "business" })], error: null });
    const snapshot = await commandPayerTransition(actor, { action: "propose", workspaceId, successorKind: "business" });
    expect(snapshot.pending).toMatchObject({ successorKind: "business", successorWorkspaceId: null });
  });

  it("keeps a person successor as before and refuses mixed or unknown shapes", async () => {
    rpc.mockResolvedValue({ data: [transition({ successor_user_id: actor.userId, successor_email: "next@example.com" })], error: null });
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorEmail: "Next@Example.com" }))
      .resolves.toMatchObject({ pending: { successorKind: "user", successorEmail: "next@example.com" } });
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorEmail: "next@example.com", successorAgencyWorkspaceId: agencyId }))
      .rejects.toBeInstanceOf(PayerTransitionValidationError);
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorKind: "agency" }))
      .rejects.toBeInstanceOf(PayerTransitionValidationError);
  });
});
