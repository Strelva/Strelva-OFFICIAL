import { describe, expect, it } from "vitest";
import { businessEntryReleaseFlags } from "@/platform/workspaces/business-entry-releases";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { NO_VIEWER, RELEASE_FLAGS, RELEASE_FLAG_ENV, resolveReleaseFlag } from "@/platform/release-flags/resolve";

describe("direct business release enrollment", () => {
  it("is closed without the master workspace release", () => {
    expect(businessEntryReleaseFlags({ STRELVA_SYSTEMS_RELEASE: "workspace", STRELVA_ASK_RELEASE: "1" })).toEqual([]);
    expect(businessEntryReleaseFlags({ STRELVA_WORKSPACE_RELEASE: "0", STRELVA_SYSTEMS_RELEASE: "1" })).toEqual([]);
  });
  it.each([undefined, "0", "true", "operators", "workspaces"])("does not turn on an unset or invalid global value %s", value => {
    expect(businessEntryReleaseFlags({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: value })).toEqual([]);
  });
  it.each(RELEASE_FLAGS)("inherits the selected global rollout for %s", flag => {
    const flags = businessEntryReleaseFlags({ STRELVA_WORKSPACE_RELEASE: "1", [RELEASE_FLAG_ENV[flag]]: "workspace" });
    expect(flags).toContain(flag);
    expect(new Set(flags).size).toBe(flags.length);
  });
  it("also records explicit global-on enrollment without changing unrelated off switches", () => {
    expect(businessEntryReleaseFlags({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "1", STRELVA_CONNECTED_SITES_RELEASE: "0" })).toEqual(["systems"]);
  });
  it("keeps Ask under its separate release while enrolling Systems", () => {
    const environment = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "workspace" };
    expect(businessEntryReleaseFlags(environment)).toEqual(["systems"]);
    expect(askReleaseMayBeOn(environment)).toBe(false);
    expect(askReleaseMayBeOn({ ...environment, STRELVA_ASK_RELEASE: "1" })).toBe(true);
    expect(resolveReleaseFlag({ workspaceRelease: true, env: "workspace", row: "on", viewer: NO_VIEWER })).toBe(true);
    expect(resolveReleaseFlag({ workspaceRelease: true, env: "off", row: "on", viewer: NO_VIEWER })).toBe(false);
  });
});
