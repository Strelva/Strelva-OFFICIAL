import { describe, expect, it } from "vitest";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";

const businessId = "33333333-3333-4333-8333-333333333333";

function body(value: unknown) {
  return JSON.stringify(value);
}

describe("workspace preview service request adapter", () => {
  it("keeps an explicit local request reopenable and visible to the synthetic provider inbox", async () => {
    const request = createPreviewRequest("business");
    const save = await request("/api/service-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body({
        action: "save", businessId, status: "requested", request: "Prepare a private request flow.",
        outcome: "Prepare a private request flow.", context: { source: "workspace_help" }, scope: ["help_request"],
        provider: { kind: "strelva" }, idempotencyKey: "preview:request:one",
      }),
    });
    expect(save.status).toBe(200);
    const saved = (await save.json() as { request: { id: string; providerAcceptance: { status: string } } }).request;
    expect(saved.providerAcceptance.status).toBe("pending");

    const listed = await request(`/api/service-requests?businessId=${businessId}`);
    expect(listed.status).toBe(200);
    expect((await listed.json() as { requests: Array<{ id: string }> }).requests.map((item) => item.id)).toEqual([saved.id]);

    const reopened = await request(`/api/service-requests?requestId=${saved.id}`);
    expect(reopened.status).toBe(200);
    expect((await reopened.json() as { request: { id: string } }).request.id).toBe(saved.id);

    const inbox = await request("/api/service-requests?providerKind=strelva");
    expect(inbox.status).toBe(200);
    expect((await inbox.json() as { requests: Array<{ id: string }> }).requests.map((item) => item.id)).toEqual([saved.id]);

    const retry = await request("/api/service-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body({
        action: "save", businessId, status: "requested", request: "Prepare a private request flow.",
        outcome: "Prepare a private request flow.", context: { source: "workspace_help" }, scope: ["help_request"],
        provider: { kind: "strelva" }, idempotencyKey: "preview:request:one",
      }),
    });
    expect(retry.status).toBe(200);
    expect((await retry.json() as { request: { id: string } }).request.id).toBe(saved.id);
  });

  it("shows an agency-addressed request in the agency preview and keeps its response retryable", async () => {
    const request = createPreviewRequest("agency");
    const inbox = await request("/api/service-requests?providerWorkspaceId=22222222-2222-4222-8222-222222222222");
    expect(inbox.status).toBe(200);
    const item = (await inbox.json() as { requests: Array<{ id: string; revision: number }> }).requests[0]!;
    const command = {
      action: "respond", requestId: item.id, expectedRevision: item.revision, decision: "accepted",
      idempotencyKey: "preview:agency:response:one",
    };
    const first = await request("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(command) });
    expect(first.status).toBe(200);
    const accepted = (await first.json() as { request: { id: string; revision: number } }).request;
    const retry = await request("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(command) });
    expect(retry.status).toBe(200);
    expect((await retry.json() as { request: { id: string; revision: number } }).request).toMatchObject({ id: accepted.id, revision: accepted.revision });
  });
});
