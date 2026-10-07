import { describe, expect, it, vi } from "vitest";
import { combineFiniteJobs, finiteJobDeliveries, finiteJobRequests } from "@/platform/finite-jobs/records";
import { readFiniteJobs } from "@/platform/finite-jobs/repository";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const businessId = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const requestId = "20000000-0000-4000-8000-000000000001";
const deliveryId = "30000000-0000-4000-8000-000000000001";
const workId = "40000000-0000-4000-8000-000000000001";
const budgetId = "50000000-0000-4000-8000-000000000001";
const actor = { userId: other, verifiedEmail: "fictional@example.test" };
const sources = () => ({
  requests: [{ id: requestId, business_workspace_id: businessId, delivery_id: deliveryId, provider_acceptance: "accepted", context: { workId } }],
  deliveries: [{ id: deliveryId, business_workspace_id: businessId, status: "accepted" }],
  work: [{ id: workId, workspace_id: businessId, payload: { status: "waiting" } }],
  budgets: [{ id: budgetId, workspace_id: businessId, work_id: workId, actual_cents: null, actual_known: false }],
});

describe("one finite job over native facets", () => {
  it("folds explicit delivery and budget links without inventing authority from context", () => {
    const jobs = combineFiniteJobs(businessId, sources());
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: `request:${requestId}`, work: null, delivery: { id: deliveryId } });
    expect(jobs[1]).toMatchObject({ id: `work:${workId}`, budgets: [{ id: budgetId, actual_cents: null }] });
    expect(finiteJobRequests(jobs)).toEqual(sources().requests);
    expect(finiteJobDeliveries(jobs)).toEqual(sources().deliveries);
  });
  it("keeps unlinked deliveries and planning budgets, including null actual cost", () => {
    const data = sources(); data.requests = []; data.work = [];
    expect(combineFiniteJobs(businessId, data).map(job => job.id)).toEqual([`delivery:${deliveryId}`, `budget:${budgetId}`]);
  });
  it("rejects cross-business, missing linked delivery and duplicate native rows", () => {
    const data = sources(); data.deliveries[0].business_workspace_id = other;
    expect(() => combineFiniteJobs(businessId, data)).toThrow("another business");
    expect(() => combineFiniteJobs(businessId, { ...sources(), deliveries: [] })).toThrow("could not be read");
    expect(() => combineFiniteJobs(businessId, { ...sources(), requests: [...sources().requests, ...sources().requests] })).toThrow("Duplicate");
  });
  it("uses one authorized snapshot and fails closed on malformed or failed sources", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: sources(), error: null });
    expect(await readFiniteJobs(actor, businessId, { rpc })).toHaveLength(2);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("read_finite_job_sources", { p_user_id: other, p_verified_email: actor.verifiedEmail, p_business_id: businessId });
    rpc.mockResolvedValue({ data: {}, error: null });
    await expect(readFiniteJobs(actor, businessId, { rpc })).rejects.toBeInstanceOf(WorkspaceStoreError);
    rpc.mockResolvedValue({ data: null, error: { message: "service_request_access_denied" } });
    await expect(readFiniteJobs(actor, businessId, { rpc })).rejects.toBeInstanceOf(WorkspaceAccessError);
    rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(readFiniteJobs(actor, businessId, { rpc })).rejects.toBeInstanceOf(WorkspaceStoreError);
    rpc.mockRejectedValue(new Error("connection lost"));
    await expect(readFiniteJobs(actor, businessId, { rpc })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
