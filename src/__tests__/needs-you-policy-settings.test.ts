import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import {
  buildPolicyView,
  planOwnerChange,
  planStrelvaChange,
  type PolicyHistoryRow,
  type PolicyRows,
  type PolicySettingsStore,
  type StoredPolicyRow,
} from "@/platform/needs-you/policy";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
let historyId = 0;
const hid = () => `bbbbbbbb-0000-4000-8000-${String(++historyId).padStart(12, "0")}`;

/** decision_policies and its history, with set_decision_policy's rules. */
function memoryStore(initial: PolicyRows = { settings: [], history: [] }) {
  const rows: PolicyRows = structuredClone(initial);
  const writes: unknown[] = [];
  const store: PolicySettingsStore = {
    async read() { return structuredClone(rows); },
    async write(_actor, _workspaceId, write) {
      writes.push(write);
      const at = rows.settings.findIndex(row => row.layer === write.layer && row.kind === write.kind && row.systemId === write.systemId);
      const current = at >= 0 ? rows.settings[at]! : null;
      if ((current?.version ?? 0) !== write.expectedVersion) throw new Error("decision_policy_version_conflict");
      const version = (current?.version ?? 0) + 1;
      if (write.route === null) { if (at >= 0) rows.settings.splice(at, 1); }
      else {
        const row: StoredPolicyRow = { layer: write.layer, kind: write.kind, systemId: write.systemId, route: write.route, version, reason: write.reason ?? "owner_setting", updatedAt: null };
        if (at >= 0) rows.settings[at] = row; else rows.settings.push(row);
      }
      if (write.route !== null || current) {
        rows.history.unshift({ id: hid(), systemId: write.systemId, kind: write.kind, layer: write.layer, oldRoute: current?.route ?? null, newRoute: write.route, reason: write.route ? write.reason ?? "owner_setting" : "owner_reset", version, at: new Date(Date.now() + version).toISOString() });
      }
    },
    notTold: async () => [],
    businesses: async () => [],
  };
  return { store, rows, writes };
}

function apply(rows: PolicyRows, write: ReturnType<typeof planOwnerChange>) {
  if (!write.ok) throw new Error(write.reason);
  const memory = memoryStore(rows);
  return memory.store.write(ACTOR as WorkspaceActor, WS, write.write).then(() => memory.store.read(ACTOR as WorkspaceActor, WS));
}

const empty = (): PolicyRows => ({ settings: [], history: [] });
const strelvaRow = (kind: StoredPolicyRow["kind"], route: StoredPolicyRow["route"]): StoredPolicyRow =>
  ({ layer: "strelva", kind, systemId: null, route, version: 1, reason: "strelva_default", updatedAt: null });

describe("policy view", () => {
  it("shows each kind with the route in force, Strelva's default and the floor", () => {
    const view = buildPolicyView(empty());
    const reply = view.kinds.find(kind => kind.kind === "review.reply")!;
    expect(reply).toMatchObject({ route: "handle_after_notice", strelvaRoute: "handle_after_notice", strelvaIsDefault: true, floor: "handle_after_notice", ownerRoute: null, ownerVersion: 0 });
    expect(reply.ownerChoices).toEqual(["handle_after_notice", "strelva_reviews", "owner_decides"]);
    const copy = view.kinds.find(kind => kind.kind === "copy.routine")!;
    // The owner can't choose below Strelva's default even though the floor is lower.
    expect(copy.floor).toBe("handle");
    expect(copy.ownerChoices).toEqual(["strelva_reviews", "owner_decides"]);
    expect(copy.strelvaChoices).toEqual(["handle", "handle_after_notice", "strelva_reviews", "owner_decides"]);
  });

  it("shows fixed kinds as always the owner's and offers nothing", () => {
    for (const kind of ["access.grant", "money", "exit", "fact.inferred"]) {
      expect(buildPolicyView(empty()).kinds.find(item => item.kind === kind)).toMatchObject({ fixed: true, route: "owner_decides", ownerChoices: [], strelvaChoices: [] });
    }
  });

  it("applies the owner's stricter setting over Strelva's", () => {
    const rows: PolicyRows = { settings: [strelvaRow("google.post", "handle_after_notice"), { ...strelvaRow("google.post", "owner_decides"), layer: "owner", reason: "owner_setting" }], history: [] };
    expect(buildPolicyView(rows).kinds.find(kind => kind.kind === "google.post")).toMatchObject({ route: "owner_decides", strelvaRoute: "handle_after_notice", strelvaIsDefault: false, ownerRoute: "owner_decides", ownerVersion: 1 });
  });
});

describe("owner changes", () => {
  it("makes a kind stricter and leaves a receipt with the old and new route", async () => {
    const next = await apply(empty(), planOwnerChange(empty(), { action: "set", kind: "google.post", systemId: null, route: "owner_decides", expectedVersion: 0 }));
    expect(buildPolicyView(next).kinds.find(kind => kind.kind === "google.post")!.route).toBe("owner_decides");
    expect(next.history[0]).toMatchObject({ layer: "owner", kind: "google.post", oldRoute: null, newRoute: "owner_decides" });
  });

  it("refuses below the floor and looser than Strelva's default", () => {
    expect(planOwnerChange(empty(), { action: "set", kind: "review.reply", systemId: null, route: "handle", expectedVersion: 0 })).toEqual({ ok: false, reason: "below_floor" });
    expect(planOwnerChange(empty(), { action: "set", kind: "copy.routine", systemId: null, route: "handle", expectedVersion: 0 })).toEqual({ ok: false, reason: "looser_than_default" });
    const strict = { settings: [strelvaRow("google.post", "owner_decides")], history: [] };
    expect(planOwnerChange(strict, { action: "set", kind: "google.post", systemId: null, route: "strelva_reviews", expectedVersion: 0 })).toEqual({ ok: false, reason: "looser_than_default" });
  });

  it("refuses fixed kinds and a stale version", () => {
    expect(planOwnerChange(empty(), { action: "set", kind: "money", systemId: null, route: "owner_decides", expectedVersion: 0 })).toEqual({ ok: false, reason: "fixed" });
    expect(planOwnerChange(empty(), { action: "reset", kind: "google.post", systemId: null, expectedVersion: 3 })).toEqual({ ok: false, reason: "stale" });
  });

  it("goes back to Strelva's default by clearing the owner's row", async () => {
    let rows = await apply(empty(), planOwnerChange(empty(), { action: "set", kind: "structure", systemId: null, route: "owner_decides", expectedVersion: 0 }));
    rows = await apply(rows, planOwnerChange(rows, { action: "set", kind: "google.post", systemId: null, route: "owner_decides", expectedVersion: 0 }));
    const plan = planOwnerChange(rows, { action: "reset", kind: "google.post", systemId: null, expectedVersion: 1 });
    expect(plan).toMatchObject({ ok: true, write: { layer: "owner", route: null, expectedVersion: 1 } });
    rows = await apply(rows, plan);
    expect(buildPolicyView(rows).kinds.find(kind => kind.kind === "google.post")).toMatchObject({ route: "strelva_reviews", ownerRoute: null });
  });

  it("undoes the owner's last change in one tap, and only that", async () => {
    let rows = await apply(empty(), planOwnerChange(empty(), { action: "set", kind: "google.post", systemId: null, route: "strelva_reviews", expectedVersion: 0 }));
    rows = await apply(rows, planOwnerChange(rows, { action: "set", kind: "google.post", systemId: null, route: "owner_decides", expectedVersion: 1 }));
    const kind = buildPolicyView(rows).kinds.find(item => item.kind === "google.post")!;
    expect(kind.ownerUndo).toMatchObject({ to: "strelva_reviews" });
    rows = await apply(rows, planOwnerChange(rows, { action: "undo", kind: "google.post", systemId: null, historyId: kind.ownerUndo!.historyId, expectedVersion: 2 }));
    expect(buildPolicyView(rows).kinds.find(item => item.kind === "google.post")!.ownerRoute).toBe("strelva_reviews");
    // An undo of an older entry, or of a row with nothing of the owner's, refuses.
    expect(planOwnerChange(rows, { action: "undo", kind: "google.post", systemId: null, historyId: kind.ownerUndo!.historyId, expectedVersion: 3 })).toEqual({ ok: false, reason: "nothing_to_undo" });
    expect(planOwnerChange(empty(), { action: "undo", kind: "structure", systemId: null, historyId: "bbbbbbbb-0000-4000-8000-000000000999", expectedVersion: 0 })).toEqual({ ok: false, reason: "nothing_to_undo" });
  });

  it("never undoes past Strelva's current default", () => {
    // The owner's row was cleared (old strelva_reviews → none) while Strelva later raised its route.
    const history: PolicyHistoryRow[] = [{ id: "bbbbbbbb-0000-4000-8000-000000000100", systemId: null, kind: "google.post", layer: "owner", oldRoute: "strelva_reviews", newRoute: "owner_decides", reason: "owner_setting", version: 1, at: "2026-10-06T10:00:00Z" }];
    const rows: PolicyRows = { settings: [strelvaRow("google.post", "owner_decides"), { ...strelvaRow("google.post", "owner_decides"), layer: "owner", reason: "owner_setting" }], history };
    expect(buildPolicyView(rows).kinds.find(kind => kind.kind === "google.post")!.ownerUndo).toBeNull();
  });
});

describe("Strelva changes", () => {
  it("never goes below the floor and can reset to the code default", () => {
    expect(planStrelvaChange(empty(), { action: "set", kind: "copy.marketing", systemId: null, route: "handle", reason: "strelva_default", expectedVersion: 0 })).toEqual({ ok: false, reason: "below_floor" });
    expect(planStrelvaChange(empty(), { action: "set", kind: "copy.routine", systemId: null, route: "handle", reason: "earned_trust", expectedVersion: 0 })).toMatchObject({ ok: true, write: { layer: "strelva", route: "handle", reason: "earned_trust" } });
    expect(planStrelvaChange({ settings: [strelvaRow("copy.routine", "handle")], history: [] }, { action: "reset", kind: "copy.routine", systemId: null, reason: "strelva_default", expectedVersion: 1 })).toMatchObject({ ok: true, write: { route: null } });
    expect(planStrelvaChange(empty(), { action: "set", kind: "exit", systemId: null, route: "owner_decides", reason: "strelva_default", expectedVersion: 0 })).toEqual({ ok: false, reason: "fixed" });
  });
});

// The route ----------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  released: vi.fn(() => true),
  workspaceReleased: vi.fn(() => true),
  actor: vi.fn(),
  workspaces: vi.fn(),
  store: { current: null as PolicySettingsStore | null },
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: vi.fn(async () => false) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceReleased }));
vi.mock("@/platform/needs-you/release", () => ({ needsYouReleaseEnabled: mocks.released }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.workspaces }));
vi.mock("@/platform/workspaces/http", async () => {
  const actual = await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http");
  return { ...actual, workspaceHttpActor: mocks.actor };
});
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

const URL_BASE = "https://app.example.test/api/workspace/needs-you/policy";
const post = (body: unknown) => new Request(URL_BASE, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "https://app.example.test" } });

describe("policy route", () => {
  let memory: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.released.mockReturnValue(true);
    mocks.workspaceReleased.mockReturnValue(true);
    mocks.actor.mockResolvedValue(ACTOR);
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Mooney" }]);
    memory = memoryStore();
    mocks.store.current = memory.store;
  });

  it("is off while the release is off", async () => {
    mocks.released.mockReturnValue(false);
    const { GET, POST } = await import("@/app/api/workspace/needs-you/policy/route");
    expect((await GET(new Request(`${URL_BASE}?workspaceId=${WS}`))).status).toBe(503);
    expect((await POST(post({ workspaceId: WS, change: { action: "reset", kind: "google.post", systemId: null, expectedVersion: 0 } }))).status).toBe(503);
    expect(memory.writes).toHaveLength(0);
  });

  it("lets a member read and refuses agencies and other businesses", async () => {
    const { GET } = await import("@/app/api/workspace/needs-you/policy/route");
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "member", name: "Mooney" }]);
    const ok = await GET(new Request(`${URL_BASE}?workspaceId=${WS}`));
    expect(ok.status).toBe(200);
    expect((await ok.json()).role).toBe("member");
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "delegated_read", role: null, name: "Mooney" }]);
    expect((await GET(new Request(`${URL_BASE}?workspaceId=${WS}`))).status).toBe(403);
    mocks.workspaces.mockResolvedValue([]);
    expect((await GET(new Request(`${URL_BASE}?workspaceId=${WS}`))).status).toBe(403);
    mocks.actor.mockResolvedValue(null);
    expect((await GET(new Request(`${URL_BASE}?workspaceId=${WS}`))).status).toBe(401);
  });

  it("lets only the owner change, and writes once", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/policy/route");
    for (const role of ["admin", "member"]) {
      mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role, name: "Mooney" }]);
      expect((await POST(post({ workspaceId: WS, change: { action: "set", kind: "google.post", systemId: null, route: "owner_decides", expectedVersion: 0 } }))).status).toBe(403);
    }
    expect(memory.writes).toHaveLength(0);
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Mooney" }]);
    const ok = await POST(post({ workspaceId: WS, change: { action: "set", kind: "google.post", systemId: null, route: "owner_decides", expectedVersion: 0 } }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.view.kinds.find((kind: { kind: string }) => kind.kind === "google.post").route).toBe("owner_decides");
    expect(memory.writes).toHaveLength(1);
  });

  it("refuses a looser or stale setting before writing", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/policy/route");
    const looser = await POST(post({ workspaceId: WS, change: { action: "set", kind: "copy.routine", systemId: null, route: "handle", expectedVersion: 0 } }));
    expect(looser.status).toBe(422);
    expect((await looser.json()).code).toBe("looser_than_default");
    const stale = await POST(post({ workspaceId: WS, change: { action: "reset", kind: "google.post", systemId: null, expectedVersion: 4 } }));
    expect(stale.status).toBe(409);
    expect(memory.writes).toHaveLength(0);
  });

  it("answers 503, not a guess, when storage fails", async () => {
    mocks.store.current = { ...memory.store, read: async () => { throw new Error("down"); } };
    const { GET } = await import("@/app/api/workspace/needs-you/policy/route");
    expect((await GET(new Request(`${URL_BASE}?workspaceId=${WS}`))).status).toBe(503);
  });
});
