import { describe, expect, it, vi } from "vitest";
import { readAccessReview, revokeAccessReview, type AccessReviewDb } from "@/platform/access-review/server";
import { accessReviewFixture, REVIEW_ACTOR, REVIEW_WORKSPACE } from "@/experience/workspace/preview/access-review-fixture";
const actor = { userId: REVIEW_ACTOR, verifiedEmail: "Owner@Example.Test" };
function db(data: unknown, message?: string) { return { rpc: vi.fn(async () => ({ data, error: message ? { message } : null })) } satisfies AccessReviewDb; }
describe("access review", () => {
  it("uses one scoped RPC and binds returned actor and scope", async () => {
    const store = db(accessReviewFixture());
    await expect(readAccessReview(actor, { workspaceId: REVIEW_WORKSPACE, organization: false }, store)).resolves.toEqual(accessReviewFixture());
    expect(store.rpc).toHaveBeenCalledOnce();
    expect(store.rpc).toHaveBeenCalledWith("read_access_review", { p_user_id: REVIEW_ACTOR, p_verified_email: "owner@example.test", p_workspace_id: REVIEW_WORKSPACE, p_organization: false });
  });
  it("rejects response substitution, duplicate units and malformed storage", async () => {
    const value = accessReviewFixture();
    for (const data of [null, { ...value, actorUserId: "27500000-0000-4000-8000-000000000002" }, { ...value, organization: true }, { ...value, units: [...value.units, ...value.units] }]) {
      await expect(readAccessReview(actor, { workspaceId: REVIEW_WORKSPACE, organization: false }, db(data))).rejects.toThrow("malformed");
    }
  });
  it("binds organization and target business and accepts a no-op retry", async () => {
    const store = db({ ok: true, changed: false });
    await expect(revokeAccessReview(actor, { workspaceId: REVIEW_WORKSPACE, organization: true, businessId: REVIEW_WORKSPACE, recordId: REVIEW_ACTOR, kind: "agent_token" }, store)).resolves.toEqual({ ok: true, changed: false });
    expect(store.rpc).toHaveBeenCalledWith("revoke_access_review_entry", expect.objectContaining({ p_organization: true, p_business_id: REVIEW_WORKSPACE, p_kind: "agent_token", p_record_id: REVIEW_ACTOR }));
  });
  it("denies stale authority and explains protected owners and provider notice", async () => {
    const input = { workspaceId: REVIEW_WORKSPACE, organization: false, businessId: REVIEW_WORKSPACE, recordId: REVIEW_ACTOR, kind: "member" as const };
    for (const [error, expected] of [["access_review_denied", "Workspace access denied"], ["access_review_protected", "Owners are protected"], ["provider_change_completion_required", "notice"], ["audit failure", "could not be confirmed"]]) await expect(revokeAccessReview(actor, input, db(null, error))).rejects.toThrow(expected);
    await expect(revokeAccessReview(actor, input, db({ ok: true }))).rejects.toThrow("malformed");
  });
});
