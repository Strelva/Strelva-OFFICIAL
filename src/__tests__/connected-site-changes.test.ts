import { describe, expect, it, vi } from "vitest";
import { askConnectedSiteChange, checkConnectedSiteChange, markConnectedSiteChangeDone, planConnectedSiteChange } from "@/products/connected-sites/changes";
import type { ConnectedSiteChange, ConnectedSiteChangesView } from "@/products/connected-sites/client";
import type { ConnectedSite } from "@/products/connected-sites/contracts";
import type { ConnectedSiteChangesStore } from "@/products/connected-sites/changes-store";
import { connectedSiteSystemId } from "@/products/connected-sites/system-id";

const WS = "77000000-0000-4000-8000-000000000002";
const SITE = "77000000-0000-4000-8000-000000000003";
const CHANGE = "77000000-0000-4000-8000-000000000004";
const AGENCY = "77000000-0000-4000-8000-000000000005";
const actor = { userId: "77000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const site = (patch: Partial<ConnectedSite> = {}): ConnectedSite => ({
  id: SITE, workspaceId: WS, publicKey: "sk_pub_abcdefghijklmnopqrstuvwx", label: "bakery", siteUrl: "https://bakery.example/", siteHost: "bakery.example", allowedOrigins: ["https://bakery.example"],
  platform: "unknown", captureForms: true, injectSchema: true, status: "active", verificationToken: null, verifiedAt: "2026-10-01T00:00:00Z", createdAt: "x", updatedAt: "x", revokedAt: null,
  firstEventAt: null, lastEventAt: null, detectedPlatform: "wix", ...patch,
});
const SYSTEM = connectedSiteSystemId({ id: SITE, workspaceId: WS });
const sites = (rows: ConnectedSite[] = [site()]) => ({ list: vi.fn(async () => rows) }) as never;
const planned = { id: "77000000-0000-4000-8000-0000000000a1", kind: "planned" as const, pageUrl: "https://bakery.example/hours", editSteps: ["a"], expectText: "Open Saturday 9-2", removeText: "Closed Saturdays", ownerFacing: false, baseline: "not_visible" as const, checkResult: null, matched: null, readBack: null, releaseNumber: null, note: null, recordedAt: "2026-10-20T00:00:00Z", actor: null };
const change = (patch: Partial<ConnectedSiteChange> = {}): ConnectedSiteChange => ({ id: CHANGE, requestId: null, origin: "agency", title: "Hours", createdAt: "2026-10-20T00:00:00Z", stage: "checking", steps: [planned], ...patch });
const view = (changes: ConnectedSiteChange[] = [change()]): ConnectedSiteChangesView => ({
  viewer: { role: "admin", isOwner: false, actingAgencyId: AGENCY, agencyName: "Agency" }, site: { id: SITE, siteHost: "bakery.example", siteUrl: "https://bakery.example/", platform: "wix" }, requests: [], changes,
});
type Fake = ConnectedSiteChangesStore & Record<"list" | "plan" | "markDone" | "recordCheck", ReturnType<typeof vi.fn>>;
const store = (overrides: Record<string, unknown> = {}): Fake => ({
  list: vi.fn(async () => view()), plan: vi.fn(async () => change()), markDone: vi.fn(async () => change()),
  recordCheck: vi.fn(async () => ({ change: change(), release: null })), ...overrides,
}) as unknown as Fake;

describe("askConnectedSiteChange", () => {
  const ask = (deps: Record<string, unknown>, extra: Record<string, unknown> = {}) => askConnectedSiteChange(actor, {
    workspaceId: WS, systemId: SYSTEM, words: "Change the banner", origin: "owner", idempotencyKey: "key-1", ...extra,
  } as never, deps as never);
  it("files a connected-site Request to the agency with the detected builder when the saved one is unknown", async () => {
    const file = vi.fn(async () => ({ id: "77000000-0000-4000-8000-0000000000b1" }));
    const result = await ask({ sites: sites(), provider: async () => ({ kind: "agency", agencyWorkspaceId: AGENCY }), file });
    expect(result).toEqual({ requestId: "77000000-0000-4000-8000-0000000000b1" });
    const command = (file.mock.calls[0] as unknown[])[1] as { context: Record<string, unknown>; scope: string[]; provider: unknown };
    expect(command.context).toMatchObject({ source: "connected_site_change", platform: "wix", origin: "owner", connectedSiteId: SITE, siteHost: "bakery.example" });
    expect(command.scope).toEqual(["website.connected_site_change"]);
    expect(command.provider).toEqual({ kind: "agency", agencyWorkspaceId: AGENCY });
  });
  it("keeps the saved builder when there is one", async () => {
    const file = vi.fn(async () => ({ id: "77000000-0000-4000-8000-0000000000b1" }));
    await ask({ sites: sites([site({ platform: "squarespace" })]), provider: async () => ({ kind: "agency", agencyWorkspaceId: AGENCY }), file });
    expect(((file.mock.calls[0] as unknown[])[1] as { context: Record<string, unknown> }).context.platform).toBe("squarespace");
  });
  it("refuses a System that is not a connected, verified site", async () => {
    const file = vi.fn();
    await expect(ask({ sites: sites(), provider: async () => ({ kind: "agency", agencyWorkspaceId: AGENCY }), file }, { systemId: "77000000-0000-4000-8000-0000000000ff" })).rejects.toThrow("This website isn't connected to this business.");
    await expect(ask({ sites: sites([site({ verifiedAt: null })]), provider: async () => ({ kind: "agency", agencyWorkspaceId: AGENCY }), file })).rejects.toThrow("This website isn't connected to this business.");
    expect(file).not.toHaveBeenCalled();
  });
});

describe("planConnectedSiteChange", () => {
  const input = { pageUrl: "https://bakery.example/hours?x=1#top", whatToChange: "Update the Saturday hours", expectText: "Open Saturday 9-2", ownerFacing: false };
  const plan = (deps: Record<string, unknown>, patch: Record<string, unknown> = {}) => planConnectedSiteChange(actor, WS, { systemId: SYSTEM, siteId: SITE, requestId: "77000000-0000-4000-8000-0000000000b1", input: { ...input, ...patch } as never }, deps as never);
  it("strips the query and hash and writes the four Wix steps", async () => {
    const changes = store();
    await plan({ sites: sites(), changes, needsYou: () => true, fetchPage: async () => "<p>Closed Saturdays</p>" });
    const args = changes.plan.mock.calls[0] as unknown[];
    const saved = args[2] as { plan: { pageUrl: string; editSteps: string[]; ownerFacing: boolean } };
    expect(saved.plan.pageUrl).toBe("https://bakery.example/hours");
    expect(saved.plan.editSteps).toHaveLength(4);
    expect(saved.plan.editSteps[0]).toContain("Wix dashboard");
    expect(saved.plan.editSteps[0]).toContain("/hours");
  });
  it("reads the page as the change is handed over and stores what it showed", async () => {
    for (const [html, expected] of [["<p>Closed Saturdays</p>", "not_visible"], ["<p>Open Saturday 9-2</p>", "visible"], [null, "unreachable"]] as const) {
      const changes = store();
      const fetchPage = vi.fn(async () => html);
      await plan({ sites: sites(), changes, needsYou: () => true, fetchPage });
      expect(fetchPage).toHaveBeenCalledWith("https://bakery.example/hours");
      expect((changes.plan.mock.calls[0] as unknown[])[2]).toMatchObject({ plan: { baseline: expected } });
    }
  });
  it("saves the plan with an unreachable baseline when the read throws", async () => {
    const changes = store();
    await plan({ sites: sites(), changes, needsYou: () => true, fetchPage: async () => { throw new Error("boom"); } });
    expect((changes.plan.mock.calls[0] as unknown[])[2]).toMatchObject({ plan: { baseline: "unreachable" } });
  });
  it("will not save an owner-facing plan while Needs you is off", async () => {
    const changes = store();
    await expect(plan({ sites: sites(), changes, needsYou: () => false }, { ownerFacing: true })).rejects.toThrow("Owner approvals use Needs you, which isn't on for this business yet. Nothing was saved.");
    expect(changes.plan).not.toHaveBeenCalled();
  });
  it("allows a plan the owner need not see while Needs you is off", async () => {
    const changes = store();
    await plan({ sites: sites(), changes, needsYou: () => false, fetchPage: async () => null });
    expect(changes.plan).toHaveBeenCalledTimes(1);
  });
  it("refuses a page that is not an address", async () => {
    await expect(plan({ sites: sites(), changes: store(), needsYou: () => true, fetchPage: async () => null }, { pageUrl: "hours" })).rejects.toThrow();
  });
});

describe("checkConnectedSiteChange", () => {
  const page = (text: string) => `<html><body><p>${text}</p></body></html>`;
  it("records unreachable with no hash when the page cannot be opened", async () => {
    const changes = store();
    await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => null, reconcile: vi.fn(async () => 0) as never });
    expect(changes.recordCheck).toHaveBeenCalledWith(actor, WS, CHANGE, { result: "unreachable", pageHash: null, matched: null });
  });
  it("records visible with a 64-hex hash, after reconciling the System", async () => {
    const order: string[] = [];
    const changes = store({ recordCheck: vi.fn(async () => { order.push("record"); return { change: change({ stage: "done" }), release: { number: 2 } }; }) });
    const reconcile = vi.fn(async () => { order.push("reconcile"); return 0; });
    const out = await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => page("We are Open Saturday 9-2"), reconcile: reconcile as never });
    const call = changes.recordCheck.mock.calls[0] as unknown[];
    expect(call[3]).toMatchObject({ result: "visible", matched: expect.stringContaining("Open Saturday 9-2") });
    expect((call[3] as { pageHash: string }).pageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(order).toEqual(["reconcile", "record"]);
    expect(reconcile).toHaveBeenCalledWith(actor, WS, { systemId: SYSTEM, origin: { kind: "connected_site", ref: SITE } });
    expect(out.release).toEqual({ number: 2 });
  });
  it("keeps not seen when the text is missing or the old text remains", async () => {
    const changes = store();
    await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => page("Open Saturday 9-2 and Closed Saturdays"), reconcile: vi.fn(async () => 0) as never });
    expect(changes.recordCheck.mock.calls[0]![3]).toMatchObject({ result: "not_visible", matched: null });
  });
  it("does not count text that was already on the page before the edit", async () => {
    const changes = store({ list: vi.fn(async () => view([change({ steps: [{ ...planned, baseline: "visible" as const }] })])) });
    await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => page("We are Open Saturday 9-2"), reconcile: vi.fn(async () => 0) as never });
    expect(changes.recordCheck.mock.calls[0]![3]).toMatchObject({ result: "unchanged" });
  });
  it("counts an edit that removed the old text even though the new text was there before", async () => {
    // With removeText set, the baseline read is not_visible while the old text stands, so the after-read is a real change.
    const changes = store();
    await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => page("Open Saturday 9-2"), reconcile: vi.fn(async () => 0) as never });
    expect(changes.recordCheck.mock.calls[0]![3]).toMatchObject({ result: "visible" });
  });
  it("falls back to a look when an older change has no baseline or its baseline was unreachable", async () => {
    for (const baseline of [undefined, null, "unreachable" as const]) {
      const changes = store({ list: vi.fn(async () => view([change({ steps: [{ ...planned, baseline }] })])) });
      await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => page("We are Open Saturday 9-2"), reconcile: vi.fn(async () => 0) as never });
      expect(changes.recordCheck.mock.calls[0]![3]).toMatchObject({ result: "unchanged" });
    }
  });
  it("survives a reconcile failure and a fetch that throws", async () => {
    const changes = store();
    await checkConnectedSiteChange(actor, WS, CHANGE, SYSTEM, { changes, fetchPage: async () => { throw new Error("boom"); }, reconcile: vi.fn(async () => { throw new Error("db"); }) as never });
    expect(changes.recordCheck.mock.calls[0]![3]).toMatchObject({ result: "unreachable" });
  });
  it("refuses a change that is not on this site", async () => {
    await expect(checkConnectedSiteChange(actor, WS, "77000000-0000-4000-8000-0000000000ff", SYSTEM, { changes: store(), fetchPage: async () => "" })).rejects.toThrow("no longer here");
  });
  it("marks done, then checks exactly once", async () => {
    const changes = store();
    await markConnectedSiteChangeDone(actor, WS, CHANGE, SYSTEM, "published", { changes, fetchPage: async () => page("Open Saturday 9-2"), reconcile: vi.fn(async () => 0) as never });
    expect(changes.markDone).toHaveBeenCalledWith(actor, WS, CHANGE, "published");
    expect(changes.recordCheck).toHaveBeenCalledTimes(1);
  });
});
