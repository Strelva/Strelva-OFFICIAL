// @vitest-environment jsdom
/**
 * October 16, legacy dashboard: Undo after every live act, and bad news with
 * Pebble in frame. Covers the server undo of a section change made live from
 * Needs you (src/lib/queue-undo.ts), the Needs you done state with Undo, the
 * photo delete held for the Undo window, and the Connections and Photos read
 * failures. No tenant, store or provider is touched: every boundary is mocked.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

const store = vi.hoisted(() => ({ event: vi.fn(), versions: vi.fn(), content: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/events", () => ({ getEventRaw: store.event }));
vi.mock("@/lib/storage", () => ({ getVersions: store.versions, getContent: store.content }));
vi.mock("@/lib/publish-tenant-sections", () => ({ publishTenantSections: store.publish }));

const context = vi.hoisted(() => ({ readOnly: false, dashboardHref: (path: string) => `/client/example${path}`, siteUrl: "", fixtureNow: undefined as number | undefined }));
vi.mock("@/components/dashboard/DashboardContext", () => ({ useDashboard: () => context, useDashboardOptional: () => context }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { QUEUE_UNDO_GRACE_MS, undoApprovedSectionEvent } from "@/lib/queue-undo";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";
import { ConnectionsPage } from "@/components/dashboard/ConnectionsPage";

const NOW = Date.parse("2026-11-23T13:14:00Z");
const approved = (patch: Partial<UnifiedEvent> = {}): UnifiedEvent => ({
  id: "evt-hours", tenantId: "harbor", source: "ai", type: "content_update", title: "Thanksgiving hours on your homepage", body: "",
  status: "approved", createdAt: new Date(NOW - 3 * 3_600_000).toISOString(), resolvedAt: new Date(NOW - 4_000).toISOString(),
  metadata: { section: "hero" }, ...patch,
}) as UnifiedEvent;

describe("undoApprovedSectionEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.event.mockResolvedValue(approved());
    store.versions.mockResolvedValue([{ id: "v2", requestId: "evt-hours", data: { note: "Closed Nov 26 and 27" } }, { id: "v1", data: { note: "Open weekdays" } }]);
    store.content.mockResolvedValue({ note: "Closed Nov 26 and 27" });
    store.publish.mockResolvedValue({ status: "published" });
  });

  it("puts the section back to the version before the approval, through the one publish service", async () => {
    expect(await undoApprovedSectionEvent({ tenantId: "harbor", eventId: "evt-hours", author: "user", now: NOW })).toEqual({ undone: true, section: "hero" });
    expect(store.publish).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "harbor", author: "user", requestId: "undo:evt-hours", versions: "strict", clearDrafts: "none",
      writes: [{ section: "hero", data: { note: "Open weekdays" }, prior: { note: "Closed Nov 26 and 27" } }],
    }));
  });

  it.each([
    ["another tenant's event", () => store.event.mockResolvedValue(approved({ tenantId: "other" })), "not_found"],
    ["a change still waiting", () => store.event.mockResolvedValue(approved({ status: "pending" })), "not_undoable"],
    ["a change with no section (a Google post)", () => store.event.mockResolvedValue(approved({ metadata: { kind: "gbp_post_draft" } })), "not_undoable"],
    ["after the window", () => store.event.mockResolvedValue(approved({ resolvedAt: new Date(NOW - QUEUE_UNDO_GRACE_MS - 1).toISOString() })), "expired"],
    ["when something changed the section since", () => store.versions.mockResolvedValue([{ id: "v3", data: {} }, { id: "v2", requestId: "evt-hours", data: {} }]), "superseded"],
    ["when there is nothing earlier", () => store.versions.mockResolvedValue([{ id: "v2", requestId: "evt-hours", data: {} }]), "no_prior"],
  ])("refuses %s and changes nothing", async (_name, arrange, reason) => {
    arrange();
    expect(await undoApprovedSectionEvent({ tenantId: "harbor", eventId: "evt-hours", author: "user", now: NOW })).toEqual({ undone: false, reason });
    expect(store.publish).not.toHaveBeenCalled();
  });
});

const roots: Root[] = [];
async function mount(component: Parameters<Root["render"]>[0]) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(component));
  return node;
}
const button = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text));
const flush = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Needs you: Make it live, then Undo", () => {
  const pending = { ...approved(), status: "pending", resolvedAt: undefined, metadata: { section: "hero", diffs: [{ field: "Hours note", before: "Open weekdays", after: "Closed Nov 26 and 27", type: "changed" }] } } as unknown as UnifiedEvent;

  it("shows the done state with Undo, and Undo calls the server reversal", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const node = await mount(createElement(QueuePage, { initialPending: [pending], initialResolved: [], pendingCount: 1 }));
    // The change is flat: the page name is the label, with no card or address strip around it.
    expect(node.textContent).toContain("The change, on your homepage");
    await act(async () => { button(node, "Make it live")!.click(); });
    await flush();
    expect(node.textContent).toContain("Made live: Thanksgiving hours on your homepage");
    await act(async () => { button(node, "Undo")!.click(); });
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith("/client/example/api/queue/evt-hours/undo", { method: "POST" });
    expect(node.textContent).toContain("Undone: Thanksgiving hours on your homepage. Your site is back to how it was.");
  });

  it("says the change is still live when Undo is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/undo")
      ? Response.json({ error: "Something else changed that part of your site since, so Undo would erase it too. Nothing changed." }, { status: 409 })
      : Response.json({ success: true })));
    const node = await mount(createElement(QueuePage, { initialPending: [pending], initialResolved: [], pendingCount: 1 }));
    await act(async () => { button(node, "Make it live")!.click(); });
    await flush();
    await act(async () => { button(node, "Undo")!.click(); });
    await flush();
    expect(node.textContent).toContain("Something else changed that part of your site since");
  });

  it("asks first when the act has no Undo (a Google post)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
    const post = { ...pending, id: "evt-gbp", metadata: { kind: "gbp_post_draft", summary: "New-patient cleanings this week." } } as unknown as UnifiedEvent;
    const node = await mount(createElement(QueuePage, { initialPending: [post], initialResolved: [], pendingCount: 1 }));
    expect(node.textContent).toContain("This goes out as soon as you say yes. Strelva can't take it back from here.");
  });

  it("labels done items as Done lately under the Open tab, with the way to Done", async () => {
    const node = await mount(createElement(QueuePage, { initialPending: [], initialResolved: [approved()], pendingCount: 0 }));
    expect(node.textContent).toContain("Done lately");
    expect(node.textContent).toContain("See everything done");
    expect(node.textContent).not.toContain("site editor");
  });
});

describe("Photos: delete held for the Undo window", () => {
  const assets = [
    { id: "m1", url: "/xa/photo-dentist.webp", filename: "Dr. Lin at work.webp", width: 1200, height: 1680, size: 1, createdAt: "2026-11-22T10:00:00Z" },
    { id: "m2", url: "/images/outcomes/storefront.webp", filename: "Our front windows.webp", width: 1600, height: 1100, size: 1, createdAt: "2026-11-20T10:00:00Z" },
  ];

  it("takes the photo out with Undo and deletes nothing until the window ends", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "DELETE" ? Response.json({ success: true }) : Response.json({ assets }));
    vi.stubGlobal("fetch", fetchMock);
    const node = await mount(createElement(PhotoLibrary, { initialSelectedId: "m1", askDeleteFirst: true }));
    await flush();
    // The grid stays beside the open photo, with the open one marked.
    expect(node.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Open Dr. Lin at work");
    await act(async () => { button(node, "Delete the photo")!.click(); });
    await flush();
    expect(node.textContent).toContain("Deleted Dr. Lin at work");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await act(async () => { button(node, "Undo")!.click(); });
    expect(node.querySelector('[aria-label="Open Dr. Lin at work"]')).not.toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("sends the delete when the window ends", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "DELETE" ? Response.json({ success: true }) : Response.json({ assets }));
    vi.stubGlobal("fetch", fetchMock);
    const node = await mount(createElement(PhotoLibrary, { initialSelectedId: "m1", askDeleteFirst: true }));
    await flush();
    await act(async () => { button(node, "Delete the photo")!.click(); });
    await flush();
    const bar = node.querySelector('[style*="animation-duration"]');
    expect(bar).not.toBeNull();
    // jsdom has no AnimationEvent, so React listens for the prefixed name.
    await act(async () => { for (const type of ["animationend", "webkitAnimationEnd"]) bar!.dispatchEvent(new Event(type, { bubbles: true })); });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/client/example/api/media?id=m1", { method: "DELETE", credentials: "same-origin", keepalive: false });
  });

  it("says the read failed with Pebble in frame and a Try again that refetches", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const node = await mount(createElement(PhotoLibrary));
    await flush();
    expect(node.textContent).toContain("Strelva could not read your photos just now.");
    expect(node.textContent).not.toContain("Reload this page");
    await act(async () => { button(node, "Try again")!.click(); });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Connections: a failed read never says nothing is connected", () => {
  it("shows the error with Try again, and no Connect rows or search box", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/api/connections") ? Response.json({ error: "unavailable" }, { status: 503 }) : Response.json({ connections: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const node = await mount(createElement(ConnectionsPage));
    await flush();
    expect(node.textContent).toContain("Strelva could not read your connections just now.");
    expect(node.textContent).toContain("Nothing was changed.");
    expect(node.textContent).not.toContain("Nothing is connected yet");
    expect([...node.querySelectorAll("button, a")].some((el) => el.textContent?.trim() === "Connect")).toBe(false);
    expect(node.querySelector('input[placeholder="Search connections"]')).toBeNull();
    await act(async () => { button(node, "Try again")!.click(); });
    await flush();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/connections"))).toHaveLength(2);
  });

  it("gives a row that needs signing in again the way to do it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/resources") ? Response.json({ error: "none" }, { status: 404 }) : url.endsWith("/api/connections")
      ? Response.json({ connections: [{ provider: "google", status: "connected", platformReady: true }, { provider: "calendly", status: "needs_reauth", platformReady: true }] })
      : Response.json({ connections: { googleBusiness: { placeId: "x" } } })));
    const node = await mount(createElement(ConnectionsPage));
    await flush();
    expect(node.querySelector('button[aria-label="Sign in to Calendly again"]')).not.toBeNull();
    expect(node.textContent).toContain("give Strelva read access to your site in Google Search Console");
  });
});
