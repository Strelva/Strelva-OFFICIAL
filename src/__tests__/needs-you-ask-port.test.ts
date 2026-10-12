import { describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import { createNeedsYouAskAdapter, createTenantEventNeedsYouAdapter, type AskDraft, type AskNeedsYouItem, type NeedsYouAskDeps } from "@/platform/ask";

const WS = "bbbbbbbb-0000-4000-8000-000000000001";

function draft(over: Partial<AskDraft> = {}): AskDraft {
  return {
    workspaceId: WS, systemId: null, tenantId: "fixture-firm", toolId: "update_section", kind: "copy.routine",
    origin: "owner_interpreted", askedOnBehalf: null, summary: "Update the hero", eventIds: ["evt-1"], ...over,
  };
}

function event(over: Partial<UnifiedEvent>): UnifiedEvent {
  return { id: "evt-1", tenantId: "fixture-firm", source: "ai", type: "content_update", title: "Hero", body: "", status: "pending", createdAt: "2026-10-06T10:00:00Z", metadata: { kind: "agent_preview" }, ...over };
}

function deps(over: Partial<NeedsYouAskDeps> & { items?: AskNeedsYouItem[]; events?: UnifiedEvent[] } = {}) {
  const sync = vi.fn(async () => undefined);
  const fallback = createTenantEventNeedsYouAdapter();
  const fallbackSubmit = vi.spyOn(fallback, "submit");
  const value: NeedsYouAskDeps = {
    linkedTenants: async () => ["fixture-firm"],
    sync,
    openItems: async () => over.items ?? [],
    readEvent: async (id) => (over.events ?? []).find((e) => e.id === id) ?? null,
    fallback,
    decideAt: (ws) => `/workspace?workspaceId=${ws}`,
    ...over,
  };
  return { value, sync, fallbackSubmit };
}

const ownerItem = (sourceId: string, id = "item-1"): AskNeedsYouItem => ({ id, route: "owner_decides", state: "open", sourceLifecycle: "tenant_event", sourceId });

describe("Ask Strelva's real Needs you port", () => {
  it("opens the item through Needs you and reports the item the owner decides on Home", async () => {
    const { value, sync } = deps({ items: [ownerItem("fixture-firm:evt-1")] });
    const routing = await createNeedsYouAskAdapter(value).submit(draft());
    expect(sync).toHaveBeenCalledWith(WS);
    expect(routing).toEqual({ route: "owner_decides", itemRef: "item-1", decideAt: `/workspace?workspaceId=${WS}` });
  });

  it("reports Strelva's review without pointing the owner anywhere", async () => {
    const { value } = deps({ items: [{ ...ownerItem("fixture-firm:evt-1"), route: "strelva_reviews" }] });
    expect(await createNeedsYouAskAdapter(value).submit(draft())).toEqual({ route: "strelva_reviews", itemRef: "item-1", decideAt: null });
  });

  it("an event that opened no item reports the route it actually took", async () => {
    const { value } = deps({ events: [event({ status: "auto_approved" })] });
    expect(await createNeedsYouAskAdapter(value).submit(draft())).toEqual({ route: "handle", itemRef: null, decideAt: null });
  });

  it("an event it cannot read is held for the owner, never claimed as handled", async () => {
    const { value } = deps({ readEvent: async () => { throw new Error("redis down"); } });
    expect((await createNeedsYouAskAdapter(value).submit(draft())).route).toBe("owner_decides");
  });

  it("another tenant's event with the same id is not this draft's", async () => {
    const { value } = deps({ events: [event({ tenantId: "other-tenant", status: "auto_approved" })] });
    expect((await createNeedsYouAskAdapter(value).submit(draft())).route).toBe("owner_decides");
  });

  it("several events: the strictest route wins and the owner's item is named", async () => {
    const { value } = deps({
      items: [{ ...ownerItem("fixture-firm:evt-1", "item-a"), route: "strelva_reviews" }, ownerItem("fixture-firm:evt-2", "item-b")],
    });
    expect(await createNeedsYouAskAdapter(value).submit(draft({ eventIds: ["evt-1", "evt-2"] }))).toEqual({ route: "owner_decides", itemRef: "item-b", decideAt: `/workspace?workspaceId=${WS}` });
  });

  it("closed items are not reported as waiting", async () => {
    const { value } = deps({ items: [{ ...ownerItem("fixture-firm:evt-1"), state: "approved" }], events: [event({ status: "approved" })] });
    expect((await createNeedsYouAskAdapter(value).submit(draft())).itemRef).toBeNull();
  });

  it("a site not linked to this business keeps today's tenant queue", async () => {
    const { value, sync, fallbackSubmit } = deps({ linkedTenants: async () => ["someone-else"] });
    expect(await createNeedsYouAskAdapter(value).submit(draft())).toEqual({ route: "owner_decides", itemRef: "evt-1", decideAt: "/dashboard/review" });
    expect(fallbackSubmit).toHaveBeenCalledOnce();
    expect(sync).not.toHaveBeenCalled();
  });

  it("an unreadable link falls back too, and a draft with no tenant does", async () => {
    const failing = deps({ linkedTenants: async () => { throw new Error("pg down"); } });
    expect((await createNeedsYouAskAdapter(failing.value).submit(draft())).decideAt).toBe("/dashboard/review");
    const noTenant = deps();
    expect((await createNeedsYouAskAdapter(noTenant.value).submit(draft({ tenantId: null }))).decideAt).toBe("/dashboard/review");
  });

  it("a draft that queued nothing has nothing to decide", async () => {
    const { value, sync } = deps();
    expect(await createNeedsYouAskAdapter(value).submit(draft({ eventIds: [] }))).toEqual({ route: "never", itemRef: null, decideAt: null });
    expect(sync).not.toHaveBeenCalled();
  });
});
