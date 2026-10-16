// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleAndAccess, personName } from "@/experience/record/PeopleAndAccess";
import { nextSpecialDay, saidBy, upcomingHolidays, weeklyLines, weeklySummary } from "@/experience/record/record-words";
import { readersFromSystems } from "@/experience/record/record-readers";
import { leaveSentence } from "@/experience/workspace/WorkspaceExit";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const providerId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const snapshot = {
  actor: { email: "dr.lin@harbordental.com", localPreview: false }, workspaceId,
  workspaces: [{ id: workspaceId, kind: "customer", name: "Harbor Dental", role: "owner" }],
  work: [], handoffs: [], products: [], delegations: [],
} as unknown as WorkspaceSnapshot;
const entry = (id: string, kind: string, label: string, status: string, canRevoke: boolean) => ({ id, kind, label, status, lastUsedAt: null, canRevoke });
const review = (providerCanRevoke = true) => ({ workspaceId, actorUserId: memberId, organization: false, inaccessibleUnits: 0, units: [{ workspaceId, name: "Harbor Dental", role: "owner", entries: [
  entry("44444444-4444-4444-8444-444444444444", "member", "dr.lin@harbordental.com", "owner", false),
  entry(memberId, "member", "ana.ruiz@harbordental.com", "member", true),
  { ...entry(providerId, "provider", "North Studio", "active", providerCanRevoke), since: "2026-10-09T14:00:00Z" },
  entry("55555555-5555-4555-8555-555555555555", "agency_assignment", "maya.okafor@northstudio.co · North Studio", "active", false),
] }] });

describe("record words", () => {
  it("names whoever said a fact, without codes", () => {
    const now = new Date("2026-10-15T15:00:00");
    expect(saidBy("owner", "2026-10-13T15:00:00", { now })).toBe("You · Tuesday");
    expect(saidBy("agency", "2026-10-09T15:00:00", { now, agencyName: "North Studio" })).toBe("North Studio · Oct 9");
    expect(saidBy("tenant_import", "2026-10-01T15:00:00", { now })).toBe("Found on your site");
    expect(saidBy("operator", null, { now })).toBe("Strelva");
  });
  it("collapses a usual week the way owners say it", () => {
    const weekly = [1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })).concat([{ day: 6, opens: "09:00", closes: "13:00" }]);
    expect(weeklySummary(weekly)).toBe("Mon–Fri 8–5 · Sat 9–1");
    expect(weeklySummary([])).toBe("Closed every day");
  });
  it("reads the week one run per line, closed days said once", () => {
    const weekly = [1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })).concat([{ day: 6, opens: "09:00", closes: "13:00" }]);
    expect(weeklyLines(weekly)).toEqual(["Mon–Fri 8–5", "Sat 9–1", "Sun closed"]);
    expect(nextSpecialDay([{ date: "2026-12-24", closed: false, opens: "08:00", closes: "12:00" }, { date: "2026-01-01", closed: true }], new Date("2026-10-15T12:00:00"))).toBe("Dec 24 · 8–12");
  });
  it("names people from their email when the review has no name", () => {
    expect(personName("ana.ruiz@harbordental.com")).toBe("Ana Ruiz");
    expect(personName("maya.okafor@northstudio.co · North Studio")).toBe("Maya Okafor");
    expect(personName("North Studio")).toBe("North Studio");
  });
  it("says what leaving stopped in one sentence, dropping zero counts", () => {
    const sentence = leaveSentence({ standingPaused: 0, standingRevoked: 0, scheduledPaused: 0, scheduledCancelled: 0, assignmentsRevoked: 3, providerDeliveriesRevoked: 0, investigationsPaused: 2, retainedAccepted: 1, retainedUnknown: 0 }, "2026-10-15T18:00:00Z");
    expect(sentence).toMatch(/I ended 3 agency assignments, paused 2 checks and kept 1 change you accepted\.$/);
    expect(sentence).not.toContain(" 0 ");
  });
  it("draws Read by only from live Systems with a connected read of the record", () => {
    const sys = (id: string, kind: string, lifecycle = "live") => ({ system: { id, name: id, kind, lifecycle } });
    const reads = (systemId: string, resource: string, state = "connected") => ({ connection: { source: { systemId }, kind: "read", state, target: { type: "business_resource", resource } } });
    const readers = readersFromSystems({ systems: [sys("site", "website"), sys("google", "listing"), sys("old", "website", "paused")], connections: [reads("site", "business_record:facts"), reads("google", "business_record:hours"), reads("google", "business_record:links"), reads("old", "business_record:facts")] });
    expect(readers?.hours?.map(item => item.name)).toEqual(["site", "google"]);
    expect(readers?.phone?.map(item => item.kind)).toEqual(["website"]);
    expect(readers?.owner_recipient).toBeUndefined();
    expect(readersFromSystems({ systems: [sys("site", "website")], connections: [reads("site", "business_record:facts", "disconnected")] })).toBeUndefined();
  });
  it("offers the next holidays, soonest first", () => {
    expect(upcomingHolidays(new Date("2026-10-15T12:00:00"), 2)).toEqual([{ label: "Thanksgiving", date: "2026-11-26" }, { label: "Christmas Eve", date: "2026-12-24" }]);
  });
});

describe("People & access (XA · R3–R5)", () => {
  let root: Root; let node: HTMLDivElement;
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
  afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  const button = (text: string) => [...document.querySelectorAll("button")].find(item => item.textContent === text) as HTMLButtonElement | undefined;

  it("lists people and the agency, and makes an invitation link without sending anything", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      if (url.startsWith("/api/workspace/access-review")) return Response.json(review());
      if (url.startsWith("/api/workspace-invitations") && init?.method === "POST") return Response.json({ token: "t0k", invitation: { id: "66666666-6666-4666-8666-666666666666", recipientEmail: "desk@harbordental.com", role: "member", status: "pending", expiresAt: "2026-10-22T00:00:00Z", createdAt: "2026-10-15T00:00:00Z" } });
      return Response.json({ invitations: [] });
    }) as unknown as typeof fetch;
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot, currentRole: "owner", request, postAction: vi.fn() })));
    expect(node.textContent).toContain("Who can see and change Harbor Dental.");
    expect(node.textContent).toContain("ana.ruiz@harbordental.com");
    expect(node.textContent).toContain("Ana Ruiz");
    expect(node.textContent).toContain("Works in Harbor Dental");
    expect(node.textContent).toContain("since October 9");
    expect(node.querySelector('a[href$="view=help#bring-in-an-agency"]')).not.toBeNull();
    expect(node.textContent).not.toContain("See all access");
    expect(node.textContent).toContain("North Studio");
    expect(document.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    const input = node.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "desk@harbordental.com"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => (node.querySelector("form") as HTMLFormElement).requestSubmit());
    const post = calls.find(call => call.url === "/api/workspace-invitations");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ workspaceId, recipientEmail: "desk@harbordental.com", role: "member" });
    expect(node.textContent).toContain("I never email it for you.");
    expect((node.querySelector('input[readonly]') as HTMLInputElement).value).toContain("/workspace/invitations/accept/t0k");
  });

  it("removes the agency through the access review revoke, after its own confirmation", async () => {
    const posts: unknown[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/access-review") && init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Response.json({ ok: true, changed: true }); }
      if (url.startsWith("/api/workspace/access-review")) return Response.json(review());
      return Response.json({ invitations: [] });
    }) as unknown as typeof fetch;
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot, currentRole: "owner", request, postAction: vi.fn() })));
    await act(async () => button("What they can do")!.click());
    expect(node.textContent).toContain("Never, without you");
    expect(node.textContent).toContain("Who at North Studio");
    expect(node.textContent).toContain("Maya Okafor");
    expect(node.textContent).toContain("Your agency since October 9");
    await act(async () => button("Remove North Studio")!.click());
    expect(posts).toHaveLength(0);
    // R5 opens in place (no dialog): the question, what stays and ends, and the one yes.
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(node.textContent).toContain("Remove North Studio?");
    const confirm = node.querySelector("button[data-xa-primary]") as HTMLButtonElement;
    expect(confirm.textContent).toContain("Remove North Studio");
    await act(async () => confirm.click());
    expect(posts).toEqual([{ workspaceId, organization: false, businessId: workspaceId, kind: "provider", recordId: providerId }]);
    expect(node.textContent).toContain("North Studio no longer has access to Harbor Dental.");
  });

  it("sends an agency the review won't drop directly to the handoff instead", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/workspace/access-review") ? Response.json(review(false)) : Response.json({ invitations: [] })) as unknown as typeof fetch;
    const released = { ...snapshot, releases: { systems: false, providerChange: true } } as WorkspaceSnapshot;
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot: released, currentRole: "owner", request, postAction: vi.fn(), initialAgency: providerId, initialRemoving: true })));
    const handoff = [...node.querySelectorAll("section[aria-labelledby='remove-agency-title'] a")].find(item => item.textContent === "Start the handoff");
    expect(handoff?.getAttribute("href")).toBe(`/workspace/provider-change?workspaceId=${workspaceId}`);
  });

  it("never links a handoff page that is closed; asks Strelva instead", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/workspace/access-review") ? Response.json(review(false)) : Response.json({ invitations: [] })) as unknown as typeof fetch;
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot, currentRole: "owner", request, postAction: vi.fn(), initialAgency: providerId, initialRemoving: true })));
    const links = [...node.querySelectorAll("section[aria-labelledby='remove-agency-title'] a")];
    expect(links.some(item => item.getAttribute("href")?.includes("provider-change"))).toBe(false);
    expect(links.find(item => item.textContent === "Ask Strelva to start the handoff")?.getAttribute("href")).toBe(`/workspace?workspaceId=${workspaceId}&view=help`);
  });

  it("says it couldn't read access, and changes nothing", async () => {
    const request = vi.fn(async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot, currentRole: "owner", request, postAction: vi.fn() })));
    expect(node.textContent).toContain("People didn't load just now.");
    expect(node.textContent).toContain("Everyone keeps the access they had.");
  });
});
