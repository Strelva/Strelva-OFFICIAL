import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  collectWorkspaceExportV3,
  findSecretShapes,
  readWorkspaceExportBuild,
  splitIntoParts,
  startWorkspaceExportV3,
  V3_CATEGORIES,
  WorkspaceExportV3Error,
  writeWorkspaceExportBuild,
  type V3Rpc,
} from "@/platform/workspace-exports/v3";
import { formatOutcomeLine, readBusinessOutcomeMonth, type BusinessOutcomeMonth } from "@/platform/business-outcomes";
import { readLeadAttribution } from "@/lib/lead-attribution";
import { readVisitAttribution } from "../../custom-repo-starter/ScaffoldLeadForm";

const actor = { userId: "u-1", verifiedEmail: "owner@example.test" } as never;
const snapshot = vi.fn(async () => ({ schemaVersion: 2 }) as never);

/** In-memory stand-in for the v3 RPCs. `leads` pages through `leadCount` rows. */
function fakeRpc(options: { role?: "owner" | "operator"; leadCount?: number; leadBody?: string; missing?: string[]; denied?: boolean } = {}) {
  const parts = new Map<number, string>();
  const state = { status: "none", tokenHash: "", failed: "" , completedManifest: null as unknown };
  const rpc: V3Rpc = async (name, args) => {
    if (options.denied) return { data: null, error: { message: "workspace_export_denied" } };
    switch (name) {
      case "workspace_export_v3_role": return { data: options.role ?? "owner", error: null };
      case "export_workspace_v3_category": {
        const category = String(args.p_category);
        if (options.missing?.includes(category)) return { data: { category, items: null, next: null }, error: null };
        if (category !== "leads") return { data: { category, items: [], next: null }, error: null };
        const total = options.leadCount ?? 2;
        const offset = Number(args.p_offset);
        const limit = Number(args.p_limit);
        const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ leadId: `lead_${offset + i}`, message: options.leadBody ?? "hello" }));
        return { data: { category, items, next: items.length === limit ? offset + limit : null }, error: null };
      }
      case "start_workspace_export_build": state.status = "building"; return { data: { buildId: "00000000-0000-4000-8000-000000000001", deliverTo: "owner@example.test", requesterRole: options.role ?? "owner" }, error: null };
      case "append_workspace_export_build_part": parts.set(Number(args.p_part), String(args.p_body)); return { data: null, error: null };
      case "complete_workspace_export_build": state.status = "ready"; state.tokenHash = String(args.p_token_hash); state.completedManifest = args.p_manifest; return { data: { status: "ready" }, error: null };
      case "fail_workspace_export_build": state.status = "failed"; state.failed = String(args.p_failure); parts.clear(); return { data: null, error: null };
      case "read_workspace_export_build_part": {
        if (state.status !== "ready" || args.p_token_hash !== state.tokenHash || !parts.has(Number(args.p_part))) return { data: null, error: { message: "workspace_export_link_invalid" } };
        return { data: { body: parts.get(Number(args.p_part)), partCount: parts.size }, error: null };
      }
      default: return { data: null, error: { message: `unknown ${name}` } };
    }
  };
  return { rpc, parts, state };
}

describe("export schema 3", () => {
  it("collects every category page by page and lists included, omitted and unavailable", async () => {
    const { rpc } = fakeRpc({ leadCount: 2500, missing: ["reviews"] });
    const doc = await collectWorkspaceExportV3(actor, "w-1", rpc, snapshot);
    expect(doc.schemaVersion).toBe(3);
    expect(doc.data.leads).toHaveLength(2500);
    expect((doc.data.leads![2499] as { leadId: string }).leadId).toBe("lead_2499");
    const included = doc.manifest.included.map((c) => c.category);
    for (const category of V3_CATEGORIES.filter((c) => c !== "reviews")) expect(included).toContain(category);
    expect(included).toContain("workspace_snapshot_schema_2");
    expect(doc.manifest.unavailable.map((c) => c.category)).toEqual(expect.arrayContaining(["calendly_bookings_not_imported", "reviews"]));
    expect(doc.manifest.omitted.map((c) => c.category)).toEqual(expect.arrayContaining(["credentials", "provider_connection_secrets", "card_data"]));
    // Nothing silently dropped: every category is included or unavailable.
    const listed = new Set([...included, ...doc.manifest.unavailable.map((c) => c.category)]);
    for (const category of V3_CATEGORIES) expect(listed.has(category)).toBe(true);
  });

  it("an operator export carries no schema-2 workspace snapshot and says why", async () => {
    const { rpc } = fakeRpc({ role: "operator" });
    snapshot.mockClear();
    const doc = await collectWorkspaceExportV3(actor, "w-1", rpc, snapshot);
    expect(snapshot).not.toHaveBeenCalled();
    expect(doc.workspaceSnapshot).toBeNull();
    expect(doc.manifest.unavailable.find((c) => c.category === "workspace_snapshot_schema_2")?.reason).toMatch(/owner/);
  });

  it("small owner exports are inline; large ones become a background build delivered by token, not refused", async () => {
    const small = fakeRpc();
    const inline = await startWorkspaceExportV3(actor, "w-1", { rpc: small.rpc, snapshot, schedule: () => { throw new Error("no build"); }, deliver: vi.fn() });
    expect(inline.kind).toBe("inline");

    const big = fakeRpc({ leadCount: 3000, leadBody: "x".repeat(1000) });
    const tasks: (() => Promise<void>)[] = [];
    const deliver = vi.fn(async (_input: { token: string }) => {});
    const outcome = await startWorkspaceExportV3(actor, "w-1", { rpc: big.rpc, snapshot, schedule: (t) => tasks.push(t), deliver });
    expect(outcome).toMatchObject({ kind: "build", deliverTo: "owner@example.test" });
    await tasks[0]!();
    expect(big.state.status).toBe("ready");
    expect(big.parts.size).toBeGreaterThan(2);
    const { token } = deliver.mock.calls[0]![0];
    expect(createHash("sha256").update(token).digest("hex")).toBe(big.state.tokenHash);
    const body = await readWorkspaceExportBuild("00000000-0000-4000-8000-000000000001", token, big.rpc);
    expect((JSON.parse(body) as { data: { leads: unknown[] } }).data.leads).toHaveLength(3000);
    await expect(readWorkspaceExportBuild("00000000-0000-4000-8000-000000000001", "wrong-token-value-123456", big.rpc)).rejects.toBeInstanceOf(WorkspaceExportV3Error);
  });

  it("an operator export is always a build delivered to the owner recipient", async () => {
    const { rpc } = fakeRpc({ role: "operator" });
    const tasks: (() => Promise<void>)[] = [];
    const deliver = vi.fn(async () => {});
    const outcome = await startWorkspaceExportV3(actor, "w-1", { rpc, snapshot, schedule: (t) => tasks.push(t), deliver });
    expect(outcome.kind).toBe("build");
    await tasks[0]!();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ deliverTo: "owner@example.test" }));
  });

  it("accepts a background build before collecting, and includes all native facets for an operator", async () => {
    const fake = fakeRpc({ role: "operator" });
    const rpc = vi.fn(fake.rpc);
    const tasks: (() => Promise<void>)[] = [];
    snapshot.mockClear();
    const deliver = vi.fn(async () => {});
    const outcome = await startWorkspaceExportV3(actor, "w-1", { rpc, snapshot, background: true, includeOperatorSnapshot: true, schedule: task => tasks.push(task), deliver });
    expect(outcome.kind).toBe("build");
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["start_workspace_export_build"]);
    expect(snapshot).not.toHaveBeenCalled();
    await tasks[0]!();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(fake.state.status).toBe("ready");
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("fails a background collection without ready parts or a link when access disappears", async () => {
    const fake = fakeRpc();
    const rpc: V3Rpc = async (name, args) => name === "workspace_export_v3_role"
      ? { data: null, error: { message: "workspace_export_denied" } } : fake.rpc(name, args);
    const tasks: (() => Promise<void>)[] = [];
    const deliver = vi.fn(), onFailure = vi.fn();
    await startWorkspaceExportV3(actor, "w-1", { rpc, snapshot, background: true, schedule: task => tasks.push(task), deliver, onFailure });
    await tasks[0]!();
    expect(fake.state.status).toBe("failed");
    expect(fake.parts.size).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: "export_collection_failed" }));
  });

  it("a delivery failure reports attention, keeps the complete archive and never logs the token", async () => {
    const { rpc, state } = fakeRpc({ role: "operator" });
    const tasks: (() => Promise<void>)[] = [];
    const onFailure = vi.fn();
    const deliver = vi.fn(async ({ token }: { token: string }) => { throw new Error(`provider failed ${token}`); });
    await startWorkspaceExportV3(actor, "w-1", { rpc, snapshot, schedule: task => tasks.push(task), deliver, onFailure });
    await expect(tasks[0]!()).resolves.toBeUndefined();
    expect(state.status).toBe("ready");
    expect(onFailure).toHaveBeenCalledWith({ buildId: "00000000-0000-4000-8000-000000000001", reason: "export_link_delivery_failed" });
  });

  it("a build containing a credential shape is failed, never delivered", async () => {
    const leaky = fakeRpc({ role: "operator", leadBody: '"refresh_token": "1//abcdefghijk"' });
    const tasks: (() => Promise<void>)[] = [];
    const deliver = vi.fn(async () => {});
    const onFailure = vi.fn();
    await startWorkspaceExportV3(actor, "w-1", { rpc: leaky.rpc, snapshot, schedule: (t) => tasks.push(t), deliver, onFailure });
    await tasks[0]!();
    expect(leaky.state.status).toBe("failed");
    expect(leaky.state.failed).toBe("secret_detected");
    expect(deliver).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalled();
    expect(findSecretShapes('{"note":"sk_live_abcdefghijkl"}')).toHaveLength(1);
    expect(findSecretShapes('{"message":"Call me about pricing"}')).toEqual([]);
  });

  it("a failed part write fails the whole build", async () => {
    const { rpc, state } = fakeRpc();
    const failing: V3Rpc = async (name, args) => (name === "append_workspace_export_build_part" && args.p_part === 1 ? { data: null, error: { message: "disk" } } : rpc(name, args));
    await rpc("start_workspace_export_build", {});
    const result = await writeWorkspaceExportBuild("b", JSON.stringify({ manifest: { included: [] }, pad: "y".repeat(2_500_000) }), failing);
    expect(result).toEqual({ status: "failed", reason: "part 1: disk" });
    expect(state.status).toBe("failed");
  });

  it("denial is a typed error", async () => {
    await expect(collectWorkspaceExportV3(actor, "w-1", fakeRpc({ denied: true }).rpc, snapshot)).rejects.toMatchObject({ code: "denied" });
  });

  it("splits on byte boundaries without breaking characters", () => {
    const parts = splitIntoParts("ééé" + "a".repeat(5), 4);
    expect(parts.join("")).toBe("éééaaaaa");
    expect(parts.every((p) => Buffer.byteLength(p) <= 4)).toBe(true);
  });
});

const september: BusinessOutcomeMonth = {
  workspaceId: "w", month: "2026-09", sites: 1,
  visits: { kind: "counted", value: 412 },
  inquiries: { kind: "counted", value: 9 },
  answered: { kind: "linked", value: 8, withinDay: 8 },
  bookings: { kind: "counted", value: 3, native: 1, legacy: 2 },
  bookingsFromInquiry: { kind: "linked", value: 2, joins: [] },
  reviews: { kind: "counted", value: 2 },
};

describe("outcome line, linked only where joined", () => {
  it("reads like the spec when every join exists", () => {
    const line = formatOutcomeLine(september);
    expect(line.text).toBe("412 visits. 9 inquiries; 8 answered within a day. 3 bookings, 2 of them from a website inquiry. 2 new reviews.");
    expect(line.figures.filter((f) => f.kind === "linked").map((f) => f.label)).toEqual(["answered within a day", "bookings from a website inquiry"]);
  });

  it("claims nothing the data can't join", () => {
    const line = formatOutcomeLine({ ...september, visits: { kind: "counted", value: null }, answered: { kind: "linked", value: null, withinDay: null },
      bookingsFromInquiry: { kind: "linked", value: null, joins: [] }, reviews: { kind: "counted", value: null } });
    expect(line.text).toBe("9 inquiries. 3 bookings.");
    expect(line.figures.every((f) => f.kind === "counted")).toBe(true);
    expect(formatOutcomeLine({ ...september, inquiries: { kind: "counted", value: 1 }, bookings: { kind: "counted", value: 0, native: 0, legacy: 0 } }).text)
      .toBe("412 visits. 1 inquiry; 8 answered within a day. 0 bookings. 2 new reviews.");
  });

  it("reads the month through the RPC and maps denial", async () => {
    const rpc = vi.fn(async () => ({ data: september, error: null }));
    expect(await readBusinessOutcomeMonth(actor, "w", "2026-09", rpc)).toBe(september);
    expect(rpc).toHaveBeenCalledWith("business_outcome_month", expect.objectContaining({ p_month: "2026-09-01" }));
    await expect(readBusinessOutcomeMonth(actor, "w", "Sept", rpc)).rejects.toMatchObject({ code: "invalid" });
    await expect(readBusinessOutcomeMonth(actor, "w", "2026-09", async () => ({ data: null, error: { message: "business_outcome_denied" } }))).rejects.toMatchObject({ code: "denied" });
  });
  it("distinguishes unavailable counts from measured zero without claiming joined outcomes", () => {
    const line = formatOutcomeLine({ ...september,
      visits: { kind: "counted", value: null }, reviews: { kind: "counted", value: null },
      inquiries: { kind: "counted", value: null, reason: "Inquiry records could not be read." },
      bookings: { kind: "counted", value: null, native: 0, legacy: null },
    });
    expect(line.text).toBe("Inquiries unavailable: Inquiry records could not be read. Bookings unavailable.");
    expect(line.figures).toEqual([]); expect(line.text).not.toContain("0 inquiries"); expect(line.text).not.toContain("0 bookings");
    const zero = formatOutcomeLine({ ...september,
      visits: { kind: "counted", value: null }, reviews: { kind: "counted", value: null },
      inquiries: { kind: "counted", value: 0 }, bookings: { kind: "counted", value: 0, native: 0, legacy: 0 },
    });
    expect(zero.text).toBe("0 inquiries. 0 bookings.");
    expect(zero.figures).toEqual([{ label: "inquiries", value: 0, kind: "counted" }, { label: "bookings", value: 0, kind: "counted" }]);
  });
});

describe("lead attribution (additive on /api/v1/leads)", () => {
  it("accepts only page, referrer and utm_* strings, bounded", () => {
    expect(readLeadAttribution({ name: "A" })).toBeNull();
    expect(readLeadAttribution({ page: " /contact ", referrer: "https://google.com/", utm_source: "gbp", utm_medium: 5, other: "x" }))
      .toEqual({ page: "/contact", referrer: "https://google.com/", utm_source: "gbp" });
    expect(readLeadAttribution({ page: "p".repeat(900) })!.page).toHaveLength(500);
  });
  it("the starter form sends the visit's page, referrer and utm tags", () => {
    expect(readVisitAttribution({ pathname: "/contact", search: "?utm_source=gbp&utm_campaign=fall&x=1" }, "https://www.google.com/"))
      .toEqual({ page: "/contact", referrer: "https://www.google.com/", utm_source: "gbp", utm_campaign: "fall" });
    expect(readVisitAttribution(null, "")).toEqual({});
  });
});
