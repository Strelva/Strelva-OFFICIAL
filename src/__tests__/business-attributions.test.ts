import { describe, expect, it, vi } from "vitest";
import { recordBusinessAttribution, readBusinessAttributions, businessAttributionReceiptSchema } from "@/platform/connect/attributions";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
const ids = { owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", business: "11111111-1111-4111-8111-111111111111", agency: "22222222-2222-4222-8222-222222222222", provider: "33333333-3333-4333-8333-333333333333", command: "44444444-4444-4444-8444-444444444444", attribution: "55555555-5555-4555-8555-555555555555", request: "66666666-6666-4666-8666-666666666666" };
const actor = { userId: ids.owner, verifiedEmail: "owner@example.test" };
const input = { workspaceId: ids.business, agencyWorkspaceId: ids.agency, source: "referral" as const, sourceReceipt: { kind: "owner_statement" as const, reference: "owner-supplied fictional reference" }, commandId: ids.command, expectedProviderId: ids.provider };
const opening = { attributionId: ids.attribution, businessWorkspaceId: ids.business, agencyWorkspaceId: ids.agency, source: input.source, sourceReceipt: { reference: input.sourceReceipt.reference, kind: "owner_statement" }, from: "2026-10-08T12:00:00+00:00", to: null, ending: null, confirmedBy: ids.owner, commandId: ids.command, providerSnapshotId: ids.provider, evidence: "owner_confirmed_statement", financialEligibility: "not_selected" };
const db = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });
describe("independent business attribution evidence", () => {
  it("binds exact owner, bringer, source receipt, command and operating snapshot without JSON key order dependence", async () => {
    const database = db(opening);
    await expect(recordBusinessAttribution(actor, input, database)).resolves.toEqual(opening);
    expect(database.rpc).toHaveBeenCalledWith("record_business_attribution", { p_workspace_id: ids.business, p_user_id: ids.owner, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: ids.agency, p_source: "referral", p_source_receipt: input.sourceReceipt, p_command_id: ids.command, p_expected_provider_id: ids.provider });
  });
  it.each(["businessWorkspaceId", "agencyWorkspaceId", "confirmedBy", "commandId", "providerSnapshotId"])("refuses returned %s from a different accepted command", async field => {
    await expect(recordBusinessAttribution(actor, input, db({ ...opening, [field]: ids.request }))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("refuses a changed source reference or inferred source", async () => {
    await expect(recordBusinessAttribution(actor, input, db({ ...opening, source: "conversion" }))).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(recordBusinessAttribution(actor, input, db({ ...opening, sourceReceipt: { ...input.sourceReceipt, reference: "different" } }))).rejects.toBeInstanceOf(WorkspaceStoreError);
    const database = db(opening);
    await expect(recordBusinessAttribution(actor, { ...input, sourceReceipt: { ...input.sourceReceipt, reference: " " } }, database)).rejects.toThrow();
    expect(database.rpc).not.toHaveBeenCalled();
  });
  it("binds ending to its immutable source, original agency and clock", () => {
    const ending = { attributionId: ids.attribution, businessWorkspaceId: ids.business, agencyWorkspaceId: ids.agency, from: opening.from, to: "2026-10-08T13:00:00+00:00", source: opening.source, sourceReceipt: input.sourceReceipt, providerChangeRequestId: ids.request, endedBy: ids.owner, oldProviderId: ids.provider, newOperatorAgencyWorkspaceId: null, completionReceipt: { id: ids.request, status: "completed" } };
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending }).success).toBe(true);
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending: { ...ending, agencyWorkspaceId: ids.business } }).success).toBe(false);
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending: null }).success).toBe(false);
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: "2026-10-08T11:00:00Z", ending: { ...ending, to: "2026-10-08T11:00:00Z" } }).success).toBe(false);
  });
  it("accepts a genuine exit ending with precisely one origin", () => {
    const ending = { attributionId: ids.attribution, businessWorkspaceId: ids.business, agencyWorkspaceId: ids.agency, from: opening.from, to: "2026-10-08T13:00:00+00:00", source: opening.source, sourceReceipt: input.sourceReceipt, providerChangeRequestId: null, workspaceExitRequestId: ids.request, endedBy: ids.owner, oldProviderId: ids.provider, newOperatorAgencyWorkspaceId: null, completionReceipt: { state: { status: "completed" } } };
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending }).success).toBe(true);
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending: { ...ending, providerChangeRequestId: ids.request } }).success).toBe(false);
    expect(businessAttributionReceiptSchema.safeParse({ ...opening, to: ending.to, ending: { ...ending, workspaceExitRequestId: null } }).success).toBe(false);
  });
  it("reads separate current operator and history, refusing cross-business history", async () => {
    const history = { businessWorkspaceId: ids.business, currentProvider: { providerId: ids.provider, agencyWorkspaceId: ids.request }, attributions: [opening] };
    await expect(readBusinessAttributions(actor, ids.business, db(history))).resolves.toEqual(history);
    await expect(readBusinessAttributions(actor, ids.business, db({ ...history, attributions: [{ ...opening, businessWorkspaceId: ids.request }] }))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("distinguishes current authority, stale evidence and unconfirmed storage", async () => {
    await expect(recordBusinessAttribution(actor, input, db(null, { message: "provider_seat_owner_required" }))).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(recordBusinessAttribution(actor, input, db(null, { message: "business_attribution_provider_stale" }))).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(recordBusinessAttribution(actor, input, db({ bad: true }))).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(readBusinessAttributions(actor, ids.business, null)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
