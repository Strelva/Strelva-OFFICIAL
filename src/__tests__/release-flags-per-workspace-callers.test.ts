/**
 * Release packet findings 5 and 6: inquiries, website rebuild, Ask, the agency
 * library and link fields honor the per-workspace layer under `workspace`,
 * while callers with no workspace in hand keep the env-only rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_VIEWER, releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { releaseWorkspaceForTenant, setReleaseFlagsDb, tenantReleaseFlagEnabled, type ReleaseFlagsDb } from "@/platform/release-flags/store";
import { inquiryReleaseEnabled, inquiryReleaseEnabledForTenant, inquiryReleaseEnabledForWorkspace, inquiryReleaseMayBeOn } from "@/products/inquiries/release";
import { websiteRebuildReleaseEnabled, websiteRebuildReleaseEnabledForTenant, websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor } from "@/products/websites/rebuild-release";
import { askReleaseEnabled, askReleaseMayBeOn } from "@/platform/ask";
import { startAskTurn, type AskTurnDeps } from "@/platform/ask/turn";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { linkFieldsReleasedFor } from "@/products/applications/internal-tool-links";
import type { ApplicationSpec } from "@/products/applications/contracts";

const ON_WS = "10000000-0000-4000-8000-000000000001"; // row: everything on
const OFF_WS = "10000000-0000-4000-8000-000000000002"; // row: everything off
const OPS_WS = "10000000-0000-4000-8000-000000000003"; // row: operators
const BARE_WS = "10000000-0000-4000-8000-000000000004"; // no rows
const TESTER = "20000000-0000-4000-8000-000000000001";
const tenants: Record<string, string> = { "on-site": ON_WS, "off-site": OFF_WS, "ops-site": OPS_WS, "bare-site": BARE_WS };
const FLAGS = ["owner_entry", "inquiries", "website_rebuild", "systems"];

let calls: { name: string; args: Record<string, unknown> }[] = [];
let failTenantLookup = false;

function row(state: string) {
  return Object.fromEntries(FLAGS.map((flag) => [flag, { state, revision: 1, changedAt: "2026-10-06T00:00:00Z" }]));
}
const fakeDb: ReleaseFlagsDb = {
  async rpc(name, args) {
    calls.push({ name, args });
    if (name === "resolve_billing_workspace") {
      if (failTenantLookup) return { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
      const workspaceId = tenants[String(args.p_tenant_id)];
      return { data: workspaceId ? { workspaceId, via: "tenant_link" } : null, error: null };
    }
    if (name === "read_workspace_release_flags") {
      const id = String(args.p_workspace_id);
      const flags = id === ON_WS ? row("on") : id === OFF_WS ? row("off") : id === OPS_WS ? row("operators") : {};
      return { data: { workspaceId: id, flags, testers: id === OPS_WS ? [TESTER] : [], testerEmails: [] }, error: null };
    }
    return { data: null, error: { message: `unexpected ${name}` } };
  },
};

function env(values: Record<string, string>) {
  for (const key of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_INQUIRIES_RELEASE", "STRELVA_WEBSITE_REBUILD_RELEASE", "STRELVA_SYSTEMS_RELEASE", "STRELVA_ASK_RELEASE"]) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

beforeEach(() => {
  calls = [];
  failTenantLookup = false;
  setReleaseFlagsDb(fakeDb);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  setReleaseFlagsDb(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tenantReleaseFlagEnabled", () => {
  it("is off everywhere when the env is unset or 0, without reading anything", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "0" });
    expect(await tenantReleaseFlagEnabled("inquiries", "on-site")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("under `workspace`, follows the converted tenant's business row", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" });
    expect(await tenantReleaseFlagEnabled("inquiries", "on-site")).toBe(true);
    expect(await tenantReleaseFlagEnabled("inquiries", "off-site")).toBe(false);
    expect(await tenantReleaseFlagEnabled("inquiries", "bare-site")).toBe(false);
    expect(await tenantReleaseFlagEnabled("inquiries", "unconverted")).toBe(false);
  });

  it("under `1`, is on for unconverted tenants and off only where a row says off", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "1" });
    expect(await tenantReleaseFlagEnabled("inquiries", "unconverted")).toBe(true);
    expect(await tenantReleaseFlagEnabled("inquiries", "bare-site")).toBe(true);
    expect(await tenantReleaseFlagEnabled("inquiries", "off-site")).toBe(false);
  });

  it("shows an `operators` row to operators and named testers only", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_WEBSITE_REBUILD_RELEASE: "workspace" });
    expect(await tenantReleaseFlagEnabled("website_rebuild", "ops-site", NO_VIEWER)).toBe(false);
    expect(await tenantReleaseFlagEnabled("website_rebuild", "ops-site", { operator: true, tester: false })).toBe(true);
    expect(await tenantReleaseFlagEnabled("website_rebuild", "ops-site", { operator: false, tester: false, userId: TESTER })).toBe(true);
  });

  it("lets the env decide when the tenant lookup fails (never turns a flag on the env has off)", async () => {
    failTenantLookup = true;
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" });
    expect(await tenantReleaseFlagEnabled("inquiries", "on-site")).toBe(false);
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "1" });
    expect(await tenantReleaseFlagEnabled("inquiries", "on-site")).toBe(true);
  });

  it("caches the tenant's business for a minute", async () => {
    expect(await releaseWorkspaceForTenant("on-site", { now: 1_000 })).toBe(ON_WS);
    expect(await releaseWorkspaceForTenant("on-site", { now: 30_000 })).toBe(ON_WS);
    expect(calls.filter((call) => call.name === "resolve_billing_workspace")).toHaveLength(1);
    expect(await releaseWorkspaceForTenant("on-site", { now: 62_000 })).toBe(ON_WS);
    expect(calls.filter((call) => call.name === "resolve_billing_workspace")).toHaveLength(2);
  });
});

describe("inquiries", () => {
  it("keeps the env-only rule for callers with no tenant (exactly 1)", () => {
    expect(inquiryReleaseEnabled({ STRELVA_INQUIRIES_RELEASE: "1" })).toBe(true);
    expect(inquiryReleaseEnabled({ STRELVA_INQUIRIES_RELEASE: "workspace" })).toBe(false);
  });

  it("may be on under `1`, or `workspace` with the workspace release", () => {
    expect(inquiryReleaseMayBeOn({ STRELVA_INQUIRIES_RELEASE: "1" })).toBe(true);
    expect(inquiryReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" })).toBe(true);
    expect(inquiryReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "0", STRELVA_INQUIRIES_RELEASE: "workspace" })).toBe(false);
    expect(inquiryReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1" })).toBe(false);
  });

  it("per tenant and per workspace under `workspace`", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" });
    expect(await inquiryReleaseEnabledForTenant("on-site")).toBe(true);
    expect(await inquiryReleaseEnabledForTenant("bare-site")).toBe(false);
    expect(await inquiryReleaseEnabledForWorkspace(ON_WS)).toBe(true);
    expect(await inquiryReleaseEnabledForWorkspace(BARE_WS)).toBe(false);
  });

  it("without the workspace release there are no rows: `1` stays on for every tenant", async () => {
    env({ STRELVA_INQUIRIES_RELEASE: "1" });
    expect(await inquiryReleaseEnabledForTenant("off-site")).toBe(true);
    expect(await inquiryReleaseEnabledForWorkspace(OFF_WS)).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("website rebuild", () => {
  it("keeps the env-only rule and adds a may-be-on gate", () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_WEBSITE_REBUILD_RELEASE: "workspace" });
    expect(websiteRebuildReleaseEnabled()).toBe(false);
    expect(websiteRebuildReleaseMayBeOn()).toBe(true);
    env({ STRELVA_WEBSITE_REBUILD_RELEASE: "1" });
    expect(websiteRebuildReleaseMayBeOn()).toBe(false);
    expect(releaseFlagMayBeOn("website_rebuild")).toBe(false);
  });

  it("per tenant and per actor under `workspace`", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_WEBSITE_REBUILD_RELEASE: "workspace" });
    expect(await websiteRebuildReleaseEnabledForTenant("on-site")).toBe(true);
    expect(await websiteRebuildReleaseEnabledForTenant("off-site")).toBe(false);
    expect(await websiteRebuildReleasedFor({ userId: TESTER }, OPS_WS)).toBe(true);
    expect(await websiteRebuildReleasedFor({ userId: "20000000-0000-4000-8000-000000000009" }, OPS_WS)).toBe(false);
    expect(await websiteRebuildReleasedFor({ userId: TESTER }, BARE_WS)).toBe(false);
  });
});

describe("Systems: Ask, agency library, link fields", () => {
  it("Ask may be on under Systems `workspace`; the env-only check still needs 1", () => {
    const base = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_ASK_RELEASE: "1" };
    expect(askReleaseMayBeOn({ ...base, STRELVA_SYSTEMS_RELEASE: "workspace" })).toBe(true);
    expect(askReleaseMayBeOn({ ...base, STRELVA_SYSTEMS_RELEASE: "1" })).toBe(true);
    expect(askReleaseMayBeOn({ ...base, STRELVA_SYSTEMS_RELEASE: "0" })).toBe(false);
    expect(askReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "workspace" })).toBe(false);
    expect(askReleaseEnabled({ ...base, STRELVA_SYSTEMS_RELEASE: "workspace" })).toBe(false);
  });

  it("an Ask turn refuses with 503 when Systems is off for the asked workspace, before reading it", async () => {
    const readSystems = vi.fn();
    const deps = {
      isOperator: false,
      readMembership: async () => ({ role: "owner", access: "member", kind: "customer" }),
      readSystems,
      released: async (_actor: unknown, workspaceId: string) => workspaceId === ON_WS,
    } as unknown as AskTurnDeps;
    const actor = { userId: TESTER, verifiedEmail: "owner@example.test" };
    const result = await startAskTurn(deps, actor, { workspaceId: BARE_WS, messages: [{ role: "user", content: "How is my site doing?" }] });
    expect(result).toEqual({ kind: "refused", status: 503, error: "Ask Strelva is not enabled. Nothing changed." });
    expect(readSystems).not.toHaveBeenCalled();
  });

  it("the agency library and link fields follow the workspace row", async () => {
    env({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "workspace" });
    expect(systemsReleaseMayBeOn()).toBe(true);
    expect(await systemsReleasedFor({ userId: TESTER }, ON_WS)).toBe(true);
    expect(await systemsReleasedFor({ userId: TESTER }, BARE_WS)).toBe(false);
    const linked = { title: "Intake", maintenanceOwner: TESTER, fields: [{ id: "client", label: "Client", type: "contact", required: true }], components: [{ kind: "form", fields: ["client"] }] } as unknown as ApplicationSpec;
    const plain = { ...linked, fields: [{ id: "note", label: "Note", type: "text", required: false }], components: [{ kind: "form", fields: ["note"] }] } as unknown as ApplicationSpec;
    expect(await linkFieldsReleasedFor(linked, { userId: TESTER }, ON_WS)).toBe(true);
    expect(await linkFieldsReleasedFor(linked, { userId: TESTER }, BARE_WS)).toBe(false);
    calls = [];
    expect(await linkFieldsReleasedFor(plain, { userId: TESTER }, BARE_WS)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("link fields keep the env-only rule without the workspace release", async () => {
    env({ STRELVA_SYSTEMS_RELEASE: "1" });
    const linked = { title: "Intake", maintenanceOwner: TESTER, fields: [{ id: "client", label: "Client", type: "contact", required: true }], components: [{ kind: "form", fields: ["client"] }] } as unknown as ApplicationSpec;
    expect(await linkFieldsReleasedFor(linked, { userId: TESTER }, OFF_WS)).toBe(true);
  });
});
