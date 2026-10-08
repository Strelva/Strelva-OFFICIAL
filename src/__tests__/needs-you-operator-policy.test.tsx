import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import type { NotToldRow, PolicyRows, PolicySettingsStore } from "@/platform/needs-you/policy";

const mocks = vi.hoisted(() => ({
  superAdmin: vi.fn(async () => true),
  actor: vi.fn(),
  released: vi.fn(() => true),
  store: { current: null as PolicySettingsStore | null },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/admin/needs-you" }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.superAdmin }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/needs-you/release", () => ({ needsYouReleaseEnabled: mocks.released }));
vi.mock("@/platform/needs-you/policy", async () => {
  const actual = await vi.importActual<typeof import("@/platform/needs-you/policy")>("@/platform/needs-you/policy");
  const proxy: PolicySettingsStore = {
    read: (...args) => mocks.store.current!.read(...args),
    write: (...args) => mocks.store.current!.write(...args),
    notTold: (...args) => mocks.store.current!.notTold(...args),
    businesses: (...args) => mocks.store.current!.businesses(...args),
  };
  return { ...actual, PostgresPolicySettingsStore: proxy };
});

const { loadBusinessPolicy, loadOwnerNotTold } = await import("@/app/admin/needs-you/data");
const { setStrelvaPolicyAction } = await import("@/app/admin/needs-you/actions");
const { OwnerNotToldPanel, notToldReason } = await import("@/app/admin/queue/OwnerNotToldPanel");
const { PolicyScreen } = await import("@/app/admin/needs-you/PolicyView");
const { NAV } = await import("@/app/admin/AdminRail");

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OPERATOR = { userId: "aaaaaaaa-0000-4000-8000-0000000000f1", verifiedEmail: "ops@strelva.example.test" };
const row = (over: Partial<NotToldRow> = {}): NotToldRow => ({
  id: "d0000000-0000-4000-8000-000000000001", workspaceId: WS, businessName: "The Mooney Firm", kind: "system.go_live", title: "Put the booking page live",
  state: "open", deliveryState: "suppressed", openedAt: "2026-10-03T11:00:00Z", expiresAt: "2026-10-17T11:00:00Z", decidedAt: null, recipientKnown: true,
  lastDelivery: { kind: "digest", status: "suppressed", reason: "email_suppressed_or_unconfigured", at: "2026-10-04T11:00:00Z" }, ...over,
});

function store(rows: PolicyRows = { settings: [], history: [] }) {
  const writes: unknown[] = [];
  const value: PolicySettingsStore = {
    read: vi.fn(async () => structuredClone(rows)),
    write: vi.fn(async (_actor, _ws, write) => {
      writes.push(write);
      rows.settings = rows.settings.filter(item => !(item.layer === write.layer && item.kind === write.kind));
      if (write.route) rows.settings.push({ layer: write.layer, kind: write.kind, systemId: null, route: write.route, version: write.expectedVersion + 1, reason: write.reason ?? "", updatedAt: null });
    }),
    notTold: vi.fn(async () => [row()]),
    businesses: vi.fn(async () => [{ id: WS, name: "The Mooney Firm", strelvaRows: 0, ownerRows: 0 }]),
  };
  return { value, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.superAdmin.mockResolvedValue(true);
  mocks.actor.mockResolvedValue(OPERATOR);
  mocks.released.mockReturnValue(true);
  mocks.store.current = store().value;
});

describe("operator loaders", () => {
  it("are off with the release, denied without a verified operator, and honest about outages", async () => {
    mocks.released.mockReturnValue(false);
    expect(await loadOwnerNotTold()).toEqual({ state: "off" });
    mocks.released.mockReturnValue(true);
    mocks.superAdmin.mockResolvedValue(false);
    expect(await loadOwnerNotTold()).toEqual({ state: "denied" });
    mocks.superAdmin.mockResolvedValue(true);
    mocks.actor.mockResolvedValue(null);
    expect(await loadBusinessPolicy(WS)).toEqual({ state: "denied" });
    mocks.actor.mockResolvedValue(OPERATOR);
    mocks.store.current = { ...store().value, notTold: async () => { throw new WorkspaceAccessError(); } };
    expect(await loadOwnerNotTold()).toEqual({ state: "denied" });
    mocks.store.current = { ...store().value, notTold: async () => { throw new Error("down"); } };
    expect((await loadOwnerNotTold()).state).toBe("unavailable");
  });

  it("reads the selected business only when it exists", async () => {
    const ready = await loadBusinessPolicy(WS);
    expect(ready.state === "ready" && ready.value.selected?.name).toBe("The Mooney Firm");
    const other = await loadBusinessPolicy("aaaaaaaa-0000-4000-8000-000000000999");
    expect(other.state === "ready" && other.value.selected).toBeNull();
  });
});

describe("Strelva's layer action", () => {
  it("refuses without an operator, with the release off, or for bad input, and writes nothing", async () => {
    const memory = store();
    mocks.store.current = memory.value;
    mocks.superAdmin.mockResolvedValue(false);
    expect((await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "set", kind: "copy.routine", systemId: null, route: "handle", reason: "strelva_default", expectedVersion: 0 } })).ok).toBe(false);
    mocks.superAdmin.mockResolvedValue(true);
    mocks.released.mockReturnValue(false);
    expect((await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "set", kind: "copy.routine", systemId: null, route: "handle", reason: "strelva_default", expectedVersion: 0 } })).ok).toBe(false);
    mocks.released.mockReturnValue(true);
    // There is no owner layer in this action's input.
    expect((await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "set", kind: "copy.routine", systemId: null, route: "handle", reason: "owner_setting", expectedVersion: 0 } })).ok).toBe(false);
    expect((await setStrelvaPolicyAction({ workspaceId: WS, layer: "owner", change: { action: "reset", kind: "copy.routine", systemId: null, reason: "strelva_default", expectedVersion: 0 } })).ok).toBe(false);
    expect(memory.writes).toHaveLength(0);
  });

  it("refuses below the floor before writing", async () => {
    const memory = store();
    mocks.store.current = memory.value;
    const result = await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "set", kind: "review.reply", systemId: null, route: "handle", reason: "strelva_default", expectedVersion: 0 } });
    expect(result).toEqual({ ok: false, message: "That setting is below what Strelva allows for this kind of change." });
    expect(memory.writes).toHaveLength(0);
  });

  it("sets Strelva's route and returns the new view", async () => {
    const memory = store();
    mocks.store.current = memory.value;
    const result = await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "set", kind: "copy.routine", systemId: null, route: "handle", reason: "earned_trust", expectedVersion: 0 } });
    expect(result.ok).toBe(true);
    expect(memory.writes).toEqual([{ layer: "strelva", kind: "copy.routine", systemId: null, route: "handle", reason: "earned_trust", expectedVersion: 0 }]);
    expect(result.ok && result.view.kinds.find(kind => kind.kind === "copy.routine")?.route).toBe("handle");
  });

  it("answers a storage outage without claiming a save", async () => {
    mocks.store.current = { ...store().value, write: async () => { throw new Error("down"); } };
    expect(await setStrelvaPolicyAction({ workspaceId: WS, change: { action: "reset", kind: "copy.routine", systemId: null, reason: "strelva_default", expectedVersion: 0 } }))
      .toEqual({ ok: false, message: "Policy storage is unavailable. Nothing was saved; try again." });
  });
});

describe("owner not told", () => {
  it("says why the owner never heard", () => {
    expect(notToldReason(row())).toMatch(/held back.*client email is off or not set up/);
    expect(notToldReason(row({ lastDelivery: { kind: "urgent", status: "bounced", reason: "mailbox_full", at: "2026-10-05T09:00:00Z" } }))).toBe("Email bounced (mailbox_full)");
    expect(notToldReason(row({ lastDelivery: null }))).toBe("Not emailed yet");
    expect(notToldReason(row({ recipientKnown: false, lastDelivery: null }))).toMatch(/^Not sent: no trusted owner address/);
    expect(notToldReason(row({ lastDelivery: { kind: "digest", status: "suppressed", reason: "no_trusted_owner_recipient", at: "2026-10-05T09:00:00Z" } }))).toBe("Not sent: no trusted owner address");
  });

  it("renders the list, the empty state and the outage, and nothing when off or denied", () => {
    const html = renderToStaticMarkup(createElement(OwnerNotToldPanel, { load: { state: "ready", value: [row(), row({ id: "d0000000-0000-4000-8000-000000000002", state: "expired", decidedAt: "2026-10-06T07:00:00Z" })] } }));
    expect(html).toContain("Owner not told");
    expect(html).toContain("Put the booking page live");
    expect(html).toContain("Lapsed");
    expect(html).toContain("nothing changed");
    expect(html).not.toMatch(/Approve|Decline/);
    expect(renderToStaticMarkup(createElement(OwnerNotToldPanel, { load: { state: "ready", value: [] } }))).toContain("Every open owner decision reached its owner by email.");
    expect(renderToStaticMarkup(createElement(OwnerNotToldPanel, { load: { state: "unavailable", message: "Nothing is hidden: try again." } }))).toContain("Nothing is hidden");
    expect(renderToStaticMarkup(createElement(OwnerNotToldPanel, { load: { state: "off" } }))).toBe("");
    expect(renderToStaticMarkup(createElement(OwnerNotToldPanel, { load: { state: "denied" } }))).toBe("");
  });
});

describe("policy screen", () => {
  it("shows the off, denied and ready states and is in the rail", async () => {
    expect(renderToStaticMarkup(createElement(PolicyScreen, { load: { state: "off" }, hrefFor: () => "#" }))).toContain("Needs you is off");
    expect(renderToStaticMarkup(createElement(PolicyScreen, { load: { state: "denied" }, hrefFor: () => "#" }))).toContain("Operators only");
    const ready = await loadBusinessPolicy(WS);
    const html = renderToStaticMarkup(createElement(PolicyScreen, { load: ready, hrefFor: id => `/admin/needs-you?workspaceId=${id}` }));
    expect(html).toContain("Who decides");
    expect(html).toContain("Strelva&#x27;s route for Routine website edits");
    expect(html).toContain("Always the owner&#x27;s (fixed rule)");
    expect(NAV.flatMap(group => group.items).some(item => item.href === "/admin/needs-you")).toBe(true);
  });
});
