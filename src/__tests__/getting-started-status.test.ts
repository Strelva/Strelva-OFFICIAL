import { describe, expect, it } from "vitest";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import { gettingStartedStatus, ownerGettingStartedHref } from "@/experience/workspace/getting-started-status";

const record: BusinessRecord = { workspaceId: "business-id", access: "owner", revision: 1, lastSequence: 1, updatedAt: null, facts: {}, services: [], people: [], contactCount: 0 };
const fact = { value: "Business detail", source: "owner" as const, verified: true, updatedAt: "2026-10-14", updatedBy: "owner-id" };
const snapshot: WorkspaceSnapshot = { actor: { email: "owner@example.test", localPreview: true }, workspaceId: "business-id", workspaces: [{ id: "business-id", name: "Juniper", kind: "customer", access: "member", role: "owner" }], work: [], handoffs: [], delegations: [], products: [], releases: { systems: false, businessSignup: true } };

describe("Getting started from current facts", () => {
  it("does not treat a signup name or saved website as completed setup", () => {
    expect(gettingStartedStatus({ ...record, facts: { display_name: fact, links: { ...fact, value: [{ kind: "website", url: "https://juniper.example" }] } } }, 0)).toBe("incomplete");
  });
  it("supports businesses without a website once details are confirmed", () => {
    expect(gettingStartedStatus({ ...record, facts: { description: fact } }, 0)).toBe("complete");
    expect(gettingStartedStatus({ ...record, facts: { description: { ...fact, verified: false } } }, 0)).toBe("incomplete");
    expect(gettingStartedStatus({ ...record, facts: { description: fact } }, 1)).toBe("incomplete");
    expect(gettingStartedStatus({ ...record, facts: { description: fact } }, null)).toBe("unavailable");
  });
  it("keeps unknown setup reachable and scopes the link to the owner business", () => {
    expect(ownerGettingStartedHref(snapshot)).toBe("/workspace/getting-started?workspaceId=business-id");
    expect(ownerGettingStartedHref({ ...snapshot, gettingStarted: "unavailable" }, "https://app.strelva.com/")).toBe("https://app.strelva.com/workspace/getting-started?workspaceId=business-id");
    expect(ownerGettingStartedHref({ ...snapshot, gettingStarted: "complete" })).toBeNull();
    for (const access of ["provider_seat", "delegated_read"] as const) expect(ownerGettingStartedHref({ ...snapshot, workspaces: [{ ...snapshot.workspaces[0]!, access }] })).toBeNull();
    expect(ownerGettingStartedHref({ ...snapshot, releases: { systems: false, businessSignup: false } })).toBeNull();
    expect(ownerGettingStartedHref({ ...snapshot, releases: undefined })).toBeNull();
  });
});
