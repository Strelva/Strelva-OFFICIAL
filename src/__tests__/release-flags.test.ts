import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RELEASE_FLAGS,
  effectiveReleaseState,
  releaseFlagEnvMode,
  resolveReleaseFlag,
  type ReleaseFlagEnvMode,
  type ReleaseFlagRowState,
} from "@/platform/release-flags/resolve";
import {
  RELEASE_FLAG_CACHE_MS,
  ReleaseFlagConflictError,
  ReleaseFlagValidationError,
  readWorkspaceReleaseFlags,
  resolveTenantOwnerEntry,
  setReleaseFlagsDb,
  setWorkspaceReleaseFlag,
  workspaceReleaseFlagEnabled,
} from "@/platform/release-flags/store";
import { systemsReleaseEnabled, systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { inquiryReleaseEnabled, inquiryReleaseEnabledForWorkspace } from "@/products/inquiries/release";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const WS = "7f000000-0000-4000-8000-000000000010";
const TESTER = "7f000000-0000-4000-8000-000000000005";

function rows(flags: Record<string, ReleaseFlagRowState>, testers: string[] = []) {
  return {
    workspaceId: WS,
    flags: Object.fromEntries(Object.entries(flags).map(([flag, state]) => [flag, { state, revision: 1, changedAt: "2026-10-06T00:00:00Z" }])),
    testers,
    testerEmails: [],
  };
}

function fakeDb(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

afterEach(() => {
  setReleaseFlagsDb(null);
  vi.unstubAllEnvs();
});

describe("release flag env modes", () => {
  it("reads 1 as on, workspace as per-client, anything else as off", () => {
    expect(releaseFlagEnvMode("owner_entry", { STRELVA_OWNER_ENTRY: "1" })).toBe("on");
    expect(releaseFlagEnvMode("owner_entry", { STRELVA_OWNER_ENTRY: "workspace" })).toBe("workspace");
    for (const value of [undefined, "", "0", "true", "on", "Workspace"]) {
      expect(releaseFlagEnvMode("owner_entry", { STRELVA_OWNER_ENTRY: value })).toBe("off");
    }
    expect(releaseFlagEnvMode("systems", { STRELVA_SYSTEMS_RELEASE: "workspace" })).toBe("workspace");
    expect(releaseFlagEnvMode("inquiries", { STRELVA_INQUIRIES_RELEASE: "1" })).toBe("on");
    expect(releaseFlagEnvMode("website_rebuild", { STRELVA_WEBSITE_REBUILD_RELEASE: "1" })).toBe("on");
  });
});

describe("the layering rule, every env value × row state × viewer", () => {
  const envs: ReleaseFlagEnvMode[] = ["off", "workspace", "on"];
  const rowStates: Array<ReleaseFlagRowState | null> = [null, "off", "operators", "on"];
  const viewers = [
    { name: "client", viewer: { operator: false, tester: false } },
    { name: "operator", viewer: { operator: true, tester: false } },
    { name: "tester", viewer: { operator: false, tester: true } },
  ];
  const expected = (env: ReleaseFlagEnvMode, row: ReleaseFlagRowState | null, privileged: boolean) => {
    if (env === "off") return false; // kill switch: a row can't turn it on
    if (row === "off") return false;
    if (row === "operators") return privileged;
    if (row === "on") return true;
    return env === "on";
  };
  for (const env of envs) for (const row of rowStates) for (const { name, viewer } of viewers) {
    it(`env ${env}, row ${row ?? "none"}, ${name}`, () => {
      expect(resolveReleaseFlag({ workspaceRelease: true, env, row, viewer })).toBe(expected(env, row, viewer.operator || viewer.tester));
    });
  }
  it("is off for everyone when the workspace release is off", () => {
    for (const row of rowStates) expect(resolveReleaseFlag({ workspaceRelease: false, env: "on", row, viewer: { operator: true, tester: true } })).toBe(false);
  });
  it("reports the effective state for the operator console", () => {
    expect(effectiveReleaseState({ workspaceRelease: true, env: "off", row: "on" })).toBe("off");
    expect(effectiveReleaseState({ workspaceRelease: true, env: "workspace", row: null })).toBe("off");
    expect(effectiveReleaseState({ workspaceRelease: true, env: "workspace", row: "operators" })).toBe("operators");
    expect(effectiveReleaseState({ workspaceRelease: true, env: "on", row: null })).toBe("on");
    expect(effectiveReleaseState({ workspaceRelease: true, env: "on", row: "off" })).toBe("off");
  });
});

describe("per-workspace resolution through the store", () => {
  it("turns Systems on for one workspace under STRELVA_SYSTEMS_RELEASE=workspace, leaving the env-only path off", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
    fakeDb(rows({ systems: "on" }));
    expect(systemsReleaseEnabled()).toBe(false);
    expect(await systemsReleaseEnabledForWorkspace(WS)).toBe(true);
  });

  it("never reads a row while the env is off (kill switch)", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "0");
    const rpc = fakeDb(rows({ inquiries: "on" }));
    expect(await inquiryReleaseEnabledForWorkspace(WS)).toBe(false);
    expect(inquiryReleaseEnabled()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets a workspace row turn a globally-on flag off for one client", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    fakeDb(rows({ systems: "off" }));
    expect(systemsReleaseEnabled()).toBe(true);
    expect(await systemsReleaseEnabledForWorkspace(WS)).toBe(false);
  });

  it("shows operators state to a named tester by user id", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_OWNER_ENTRY", "workspace");
    fakeDb(rows({ owner_entry: "operators" }, [TESTER]));
    expect(await workspaceReleaseFlagEnabled("owner_entry", WS, { operator: false, tester: false, userId: TESTER })).toBe(true);
    expect(await workspaceReleaseFlagEnabled("owner_entry", WS, { operator: false, tester: false, userId: "7f000000-0000-4000-8000-000000000099" })).toBe(false);
  });

  it("falls back to the env value alone when the read fails, never turning a flag on", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb(null, { message: "connection refused" });
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
    expect(await workspaceReleaseFlagEnabled("systems", WS)).toBe(false);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    expect(await workspaceReleaseFlagEnabled("systems", WS)).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("caches a workspace's rows for at most 60 seconds", async () => {
    const rpc = fakeDb(rows({ systems: "on" }));
    await readWorkspaceReleaseFlags(WS, { now: 1_000 });
    await readWorkspaceReleaseFlags(WS, { now: 1_000 + RELEASE_FLAG_CACHE_MS - 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    await readWorkspaceReleaseFlags(WS, { now: 1_000 + RELEASE_FLAG_CACHE_MS });
    expect(rpc).toHaveBeenCalledTimes(2);
    await readWorkspaceReleaseFlags(WS, { now: 1_000 + RELEASE_FLAG_CACHE_MS, fresh: true });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("covers every flag the spec names", () => {
    expect([...RELEASE_FLAGS].sort()).toEqual([
      "catalog_reports", "connected_sites", "inquiries", "internal_tool_notices",
      "make_real_live:booking_page", "make_real_live:hosted_website", "make_real_live:inquiry_form",
      "make_real_live:internal_app", "make_real_live:tenant_content",
      "make_real_owner_link", "newsletter_contacts", "owner_entry", "publishing", "publishing_record_google_policy", "systems", "website_rebuild",
    ]);
  });
});

describe("operator writes", () => {
  const input = { operatorEmail: "Op@Example.test", workspaceId: WS, flag: "owner_entry" as const, state: "operators" as const, reason: "Walk the pages", expectedRevision: 0 };

  it("sends the normalized operator email and the expected revision", async () => {
    const rpc = fakeDb(rows({ owner_entry: "operators" }));
    await setWorkspaceReleaseFlag(input);
    expect(rpc).toHaveBeenCalledWith("set_workspace_release_flag_approved", expect.objectContaining({ p_operator_email: "op@example.test", p_expected_revision: 0, p_state: "operators", p_approval_id: null }));
  });

  it("maps a non-operator to an access error, a race to a conflict and bad input to validation", async () => {
    fakeDb(null, { message: "workspace_release_operator_required" });
    await expect(setWorkspaceReleaseFlag(input)).rejects.toBeInstanceOf(WorkspaceAccessError);
    fakeDb(null, { message: "workspace_release_revision_conflict" });
    await expect(setWorkspaceReleaseFlag(input)).rejects.toBeInstanceOf(ReleaseFlagConflictError);
    fakeDb(null, { message: "workspace_release_reason_required" });
    await expect(setWorkspaceReleaseFlag(input)).rejects.toBeInstanceOf(ReleaseFlagValidationError);
  });

  it("refuses a malformed database answer", async () => {
    fakeDb({ workspaceId: "nope" });
    await expect(resolveTenantOwnerEntry("gldf", { userId: TESTER, verifiedEmail: "t@example.test" })).rejects.toThrow(/malformed/);
  });
});
