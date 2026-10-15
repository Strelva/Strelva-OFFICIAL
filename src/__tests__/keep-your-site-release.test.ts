import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectedSitesReleaseEnabled, connectedSitesReleasedFor, workspaceReleaseFlagEnabled, releaseViewerFor } = vi.hoisted(() => ({
  connectedSitesReleaseEnabled: vi.fn(),
  connectedSitesReleasedFor: vi.fn(),
  workspaceReleaseFlagEnabled: vi.fn(),
  releaseViewerFor: vi.fn(),
}));
vi.mock("@/products/connected-sites/release", () => ({ connectedSitesReleaseEnabled, connectedSitesReleasedFor }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled }));
vi.mock("@/platform/release-flags/viewer", () => ({ releaseViewerFor }));

import {
  connectedSiteChangeOwnerEmailEnabled, keepYourSiteMayBeOn, keepYourSiteReleasedFor,
} from "@/products/connected-sites/keep-your-site-release";

const WS = "77000000-0000-4000-8000-000000000002";
const actor = { userId: "77000000-0000-4000-8000-000000000001" };

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  connectedSitesReleaseEnabled.mockReset().mockReturnValue(true);
  connectedSitesReleasedFor.mockReset().mockResolvedValue(true);
  workspaceReleaseFlagEnabled.mockReset().mockResolvedValue(true);
  releaseViewerFor.mockReset().mockResolvedValue({ operator: false, tester: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("keep your site release", () => {
  it("is off with the env unset and reads no row", async () => {
    vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "");
    expect(keepYourSiteMayBeOn()).toBe(false);
    expect(await keepYourSiteReleasedFor(actor, WS)).toBe(false);
    expect(workspaceReleaseFlagEnabled).not.toHaveBeenCalled();
    expect(connectedSitesReleasedFor).not.toHaveBeenCalled();
  });

  it("is on when connected sites are on and the business row is on", async () => {
    vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
    expect(keepYourSiteMayBeOn()).toBe(true);
    expect(await keepYourSiteReleasedFor(actor, WS)).toBe(true);
    expect(workspaceReleaseFlagEnabled).toHaveBeenCalledWith("keep_your_site", WS, { operator: false, tester: false });
  });

  it("is off when the business row is off", async () => {
    vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
    workspaceReleaseFlagEnabled.mockResolvedValue(false);
    expect(await keepYourSiteReleasedFor(actor, WS)).toBe(false);
  });

  it("is off when connected sites are off for the business, even with the keep row on", async () => {
    vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
    connectedSitesReleasedFor.mockResolvedValue(false);
    expect(await keepYourSiteReleasedFor(actor, WS)).toBe(false);
    expect(workspaceReleaseFlagEnabled).not.toHaveBeenCalled();
  });

  it("is off everywhere when connected sites are off", () => {
    vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "1");
    connectedSitesReleaseEnabled.mockReturnValue(false);
    expect(keepYourSiteMayBeOn()).toBe(false);
  });

  it("emails owners about planned changes only when both switches are on", () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "");
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "1");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(false);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(false);
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "1");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(true);
  });
});

describe("keep your site flag migration", () => {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const file = "20261027160000_keep_your_site_flag.sql";
  it("sorts after every other migration, binds the flag to website Systems and has a rollback", () => {
    const others = readdirSync(dir).filter(name => /^\d{14}_.*\.sql$/.test(name) && !name.includes("keep_your_site"));
    expect(others.filter(name => name > file)).toEqual([]);
    const sql = readFileSync(path.join(dir, file), "utf8");
    expect(sql).toContain("keep_your_site");
    expect(sql).toContain("when 'keep_your_site' then 'website'");
    expect(readdirSync(dir)).toContain(`rollback-${file}`);
  });
});
