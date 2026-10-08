import { describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import { authorizePublishingEvent, type PublishingAuthorityDeps } from "@/products/publishing/authority";
const workspaceId = "7f000000-0000-4000-8000-000000000010";
const actorId = "7f000000-0000-4000-8000-000000000001";
const event: UnifiedEvent = { id: "event", createdAt: "2026-10-07T12:00:00Z", source: "ai", type: "newsletter_draft", status: "pending", title: "Issue", body: "Reviewed copy", tenantId: "mooney", metadata: { workspaceId, kind: "workspace_newsletter_issue" } };
const deps = (): PublishingAuthorityDeps => ({ target: vi.fn(async () => ({ workspaceId } as never)), owner: vi.fn(async () => ({ email: "owner@example.test" } as never)), session: vi.fn(async () => null), permission: vi.fn(async () => true), linked: vi.fn(async () => ({ tenantId: "mooney" } as never)), record: vi.fn(async () => ({ access: "owner" } as never)), released: vi.fn(async () => true), viewer: vi.fn(async () => ({ operator: false, tester: false })) });
describe("publishing decision authority", () => {
  it("native approvals require the business owner and workspace release, including signed links", async () => {
    const d = deps(); const scope = `workspace-${workspaceId}`;
    const native = { ...event, tenantId: scope };
    d.workspaceOwner = vi.fn(async () => ({ email: "owner@example.test" } as never));
    d.workspaceReleased = vi.fn(async () => true);
    expect((await authorizePublishingEvent({ tenantId: scope, event: native, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(true);
    d.workspaceOwner = vi.fn(async () => ({ email: "new@example.test" } as never));
    expect((await authorizePublishingEvent({ tenantId: scope, event: native, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(false);
    d.session = vi.fn(async () => ({ id: actorId, email: "owner@example.test", email_confirmed_at: "now" } as never));
    expect((await authorizePublishingEvent({ tenantId: scope, event: native, actorId }, d)).allowed).toBe(true);
    expect(d.target).not.toHaveBeenCalled(); expect(d.permission).not.toHaveBeenCalled(); expect(d.linked).not.toHaveBeenCalled();
    d.record = vi.fn(async () => ({ access: "admin" } as never));
    expect((await authorizePublishingEvent({ tenantId: scope, event: native, actorId }, d)).allowed).toBe(false);
    d.record = deps().record; d.workspaceReleased = vi.fn(async () => false);
    expect((await authorizePublishingEvent({ tenantId: scope, event: native, actorId }, d)).allowed).toBe(false);
    d.workspaceReleased = vi.fn(async () => true);
    expect((await authorizePublishingEvent({ tenantId: scope, event: { ...native, metadata: { ...native.metadata, workspaceId: "7f000000-0000-4000-8000-000000000099" } }, actorId }, d)).allowed).toBe(false);
  });
  it("accepts a recipient-bound decision only for the live owner of the linked business", async () => {
    const d = deps(); expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(true);
    expect(d.owner).toHaveBeenCalledWith(workspaceId);
    d.owner = vi.fn(async () => ({ email: "new-owner@example.test" } as never));
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(false);
    // No trusted owner address (an operator- or agency-written one is pending): no link decides.
    d.owner = vi.fn(async () => null);
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(false);
  });
  it("denies generic sessionless actors, changed tenant links and an off flag", async () => {
    const d = deps(); expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "user" }, d)).allowed).toBe(false);
    d.target = vi.fn(async () => ({ workspaceId: "7f000000-0000-4000-8000-000000000099" } as never));
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(false);
    d.target = deps().target; d.released = vi.fn(async () => false);
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "owner-link:owner@example.test" }, d)).allowed).toBe(false);
  });
  it("checks the session actor and refuses operator access without an owner instruction", async () => {
    const d = deps(); d.session = vi.fn(async () => ({ id: actorId, email: "owner@example.test", email_confirmed_at: "now" } as never));
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId }, d)).allowed).toBe(true);
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId: "7f000000-0000-4000-8000-000000000002" }, d)).allowed).toBe(false);
    d.record = vi.fn(async () => ({ access: "admin" } as never));
    expect((await authorizePublishingEvent({ tenantId: "mooney", event, actorId }, d)).allowed).toBe(false);
  });
});
