import { describe, expect, it, vi } from "vitest";
import { STOPPED_REPORTING_AFTER_MS, connectedSiteHealth } from "@/products/connected-sites/client";
import { checkConnectedSite } from "@/products/connected-sites/site-checks";
import type { ConnectedSite } from "@/products/connected-sites/contracts";
import { connectedSiteObservation } from "@/experience/systems/server";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const base = { status: "active" as "active" | "revoked", siteHost: "bakery.example", verifiedAt: "2026-10-01T00:00:00Z" as string | null, lastEventAt: null as string | null, lastCheckedAt: null as string | null, lastCheckResult: null as "present" | "missing" | "unreachable" | null };
const h = (patch: Partial<typeof base>) => connectedSiteHealth({ ...base, ...patch }, NOW);

describe("connectedSiteHealth", () => {
  it("disconnected", () => expect(h({ status: "revoked" })).toMatchObject({ state: "disconnected", label: "Disconnected", tone: "draft", detail: "Strelva no longer takes anything from bakery.example." }));
  it("not installed", () => expect(h({ verifiedAt: null })).toMatchObject({ state: "not_installed", label: "Not installed yet", tone: "need", detail: "Add the two lines to bakery.example, publish, then check." }));
  it("stopped after a check found the lines gone", () => {
    expect(h({ lastEventAt: "2026-10-10T00:00:00Z", lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "missing" })).toMatchObject({ state: "stopped", label: "Stopped reporting", tone: "down" });
    expect(h({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "missing" }).state).toBe("stopped");
  });
  it("reporting when a visit is newer than the missing check", () => {
    expect(h({ lastEventAt: "2026-10-19T00:00:00Z", lastCheckedAt: "2026-10-10T00:00:00Z", lastCheckResult: "missing" }).state).toBe("reporting");
  });
  it("unreachable only when the check is newer than the last visit", () => {
    expect(h({ lastEventAt: "2026-10-10T00:00:00Z", lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "unreachable" })).toMatchObject({ state: "unreachable", label: "Couldn’t open the site", tone: "need" });
    expect(h({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "unreachable" }).state).toBe("unreachable");
    expect(h({ lastEventAt: "2026-10-19T00:00:00Z", lastCheckedAt: "2026-10-18T00:00:00Z", lastCheckResult: "unreachable" }).state).toBe("reporting");
  });
  it("installed with no visits yet", () => expect(h({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "present" })).toMatchObject({ state: "installed", label: "Installed · no visits yet", tone: "draft" }));
  it("stopped when visits are older than a week", () => {
    const last = new Date(NOW - STOPPED_REPORTING_AFTER_MS - 1000).toISOString();
    expect(h({ lastEventAt: last })).toMatchObject({ state: "stopped", tone: "down" });
    expect(h({ lastEventAt: last }).detail).toMatch(/^No visits reported since [A-Z][a-z]{2} \d+\./);
  });
  it("reporting", () => expect(h({ lastEventAt: "2026-10-19T00:00:00Z" })).toMatchObject({ state: "reporting", label: "Installed and reporting", tone: "live" }));
});

describe("connectedSiteObservation with a live re-check", () => {
  const obs = (patch: Record<string, unknown>) => connectedSiteObservation("sys", { siteHost: "bakery.example", verified: true, lastEventAt: null, ...patch } as never, NOW);
  it("maps health states to outcomes", () => {
    expect(obs({ lastEventAt: "2026-10-19T00:00:00Z", lastCheckedAt: null, lastCheckResult: null }).outcome).toBe("pass");
    expect(obs({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "present" }).outcome).toBe("unknown");
    expect(obs({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "missing" }).outcome).toBe("fail");
    expect(obs({ lastCheckedAt: "2026-10-19T00:00:00Z", lastCheckResult: "unreachable" }).outcome).toBe("warn");
    expect(obs({ verified: false, lastCheckedAt: null, lastCheckResult: null }).outcome).toBe("unknown");
  });
  it("keeps today's behaviour when the check fields are absent", () => {
    expect(obs({}).message).toBe("bakery.example has not reported a visit yet. Check the Strelva script is on the page.");
    expect(obs({ lastEventAt: "2026-10-19T00:00:00Z" })).toMatchObject({ outcome: "pass", message: "bakery.example is reporting visits." });
  });
});

describe("checkConnectedSite", () => {
  const site: ConnectedSite = { id: "77000000-0000-4000-8000-000000000003", workspaceId: "77000000-0000-4000-8000-000000000002", publicKey: KEY, label: "b", siteUrl: "https://bakery.example/", siteHost: "bakery.example", allowedOrigins: ["https://bakery.example"], platform: "unknown", captureForms: true, injectSchema: true, status: "active", verificationToken: null, verifiedAt: "2026-10-01T00:00:00Z", createdAt: "x", updatedAt: "x", revokedAt: null, firstEventAt: null, lastEventAt: null };
  const actor = { userId: "77000000-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" };
  const run = async (fp: { reachable: boolean; html: string | null; platform?: string }) => {
    const recordCheck = vi.fn(async () => site);
    await checkConnectedSite(actor, site.workspaceId, site.id, {
      store: { list: async () => [site], recordCheck } as never,
      fingerprint: async () => ({ reachable: fp.reachable, finalUrl: null, html: fp.html, detection: { platform: (fp.platform ?? "unknown") as never, evidence: fp.platform ? ["generator: x"] : [], confident: !!fp.platform } }),
    });
    return recordCheck;
  };
  it("present with the detected builder", async () => {
    const rc = await run({ reachable: true, html: `<script data-strelva-site="${KEY}" src="x"></script>`, platform: "wix" });
    expect(rc).toHaveBeenCalledWith(actor, site.workspaceId, site.id, { result: "present", platform: "wix", evidence: ["generator: x"] });
  });
  it("missing", async () => {
    expect(await run({ reachable: true, html: "<html></html>" })).toHaveBeenCalledWith(actor, site.workspaceId, site.id, { result: "missing", platform: null, evidence: [] });
  });
  it("unreachable", async () => {
    expect(await run({ reachable: false, html: null })).toHaveBeenCalledWith(actor, site.workspaceId, site.id, { result: "unreachable", platform: null, evidence: [] });
  });
  it("refuses an inactive site", async () => {
    await expect(checkConnectedSite(actor, site.workspaceId, "77000000-0000-4000-8000-0000000000ff", { store: { list: async () => [site] } as never })).rejects.toThrow(/no longer active/);
  });
});
