import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgencyClientSitesPage } from "@/products/connected-sites/client";
import type { ConnectedSiteChangesStore } from "@/products/connected-sites/changes-store";
import type { ConnectedSite } from "@/products/connected-sites/contracts";
import { checkClientSites, connectClientSite, detectClientSites, readAgencyClientSites, type AgencySitesDeps } from "@/products/connected-sites/agency-sites";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const AGENCY = "7e000000-0000-4000-8000-0000000000a0";
const actor = { userId: "7e000000-0000-4000-8000-0000000000b0", verifiedEmail: "staff@example.test" };
const id = (n: number) => `7e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.parse("2026-10-20T12:00:00Z");

const site = (n: number, patch: Record<string, unknown> = {}) => ({
  id: id(900 + n), siteHost: `client${n}.example`, siteUrl: `https://client${n}.example/`, platform: "unknown" as const, detectedPlatform: null, verifiedAt: null as string | null,
  firstEventAt: null, lastEventAt: null as string | null, lastCheckedAt: null, lastCheckResult: null, ...patch,
});
const row = (n: number, patch: Record<string, unknown> = {}) => ({ workspaceId: id(n), name: `Client ${String(n).padStart(2, "0")}`, website: `https://client${n}.example/`, sourceUrl: null, detection: null, site: null, ...patch });

function setup(pages: AgencyClientSitesPage[], patch: Partial<AgencySitesDeps> = {}) {
  let call = 0;
  const changes = {
    agencyClientSites: vi.fn(async () => pages[Math.min(call++, pages.length - 1)]!),
    recordDetection: vi.fn(async (_actor: unknown, workspaceId: string, input: { siteUrl: string; siteHost: string; platform: string; evidence: string[]; reachable: boolean }) => ({ ...input, detectedAt: "2026-10-20T12:00:00Z", workspaceId })),
  };
  const deps: AgencySitesDeps = { changes: changes as unknown as ConnectedSiteChangesStore, released: vi.fn(async () => true), now: () => NOW, normalizeSiteUrl: raw => { const u = new URL(raw); return { siteUrl: `${u.origin}/`, siteHost: u.hostname }; }, ...patch };
  return { changes, deps };
}
const page = (rows: unknown[], nextCursor: { name: string; id: string } | null = null) => ({ clients: rows, nextCursor }) as AgencyClientSitesPage;

describe("readAgencyClientSites", () => {
  it("marks each client on or off for itself and derives install health", async () => {
    const { deps } = setup([page([row(1, { site: site(1, { verifiedAt: "2026-10-01T00:00:00Z", lastEventAt: "2026-10-19T00:00:00Z" }) }), row(2)])], { released: vi.fn(async (_a, workspaceId) => workspaceId === id(1)) });
    const view = await readAgencyClientSites(actor, AGENCY, null, deps);
    expect(view.clients.map(client => client.enabled)).toEqual([true, false]);
    expect(view.clients[0]!.health).toMatchObject({ state: "reporting", label: "Installed and reporting" });
    expect(view.clients[1]!.health).toBeNull();
  });
  it("treats a failed release read as off", async () => {
    const { deps } = setup([page([row(1)])], { released: vi.fn(async () => { throw new Error("db"); }) });
    expect((await readAgencyClientSites(actor, AGENCY, null, deps)).clients[0]!.enabled).toBe(false);
  });
});

describe("detectClientSites", () => {
  const read = (platform: string, reachable = true) => async () => ({ reachable, finalUrl: null, html: reachable ? "<html></html>" : null, detection: { platform: platform as never, evidence: platform === "unknown" ? [] : ["generator: x"], confident: true } });
  it("ignores ids not in the agency's pages and clients where keep your site is off", async () => {
    const { changes, deps } = setup([page([row(1), row(2)])], { released: vi.fn(async (_a, workspaceId) => workspaceId !== id(2)), fingerprint: read("wix") });
    const results = await detectClientSites(actor, AGENCY, [id(1), id(2), id(3)], deps);
    expect(results.map(item => [item.workspaceId, item.status])).toEqual([[id(1), "ok"], [id(2), "skipped"], [id(3), "skipped"]]);
    expect(changes.recordDetection).toHaveBeenCalledTimes(1);
    expect(changes.recordDetection.mock.calls[0]![1]).toBe(id(1));
  });
  it("reads at most four sites at once", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(index + 1));
    let active = 0, peak = 0;
    const { deps } = setup([page(rows)], { fingerprint: async () => { active += 1; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active -= 1; return read("wix")(); } });
    const results = await detectClientSites(actor, AGENCY, rows.map(item => item.workspaceId), deps);
    expect(results).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
  it("records an unreachable site as not reachable with an unknown builder", async () => {
    const { changes, deps } = setup([page([row(1)])], { fingerprint: read("wix", false) });
    await detectClientSites(actor, AGENCY, [id(1)], deps);
    expect(changes.recordDetection.mock.calls[0]![2]).toMatchObject({ reachable: false, platform: "unknown", evidence: [] });
  });
  it("uses the connected site's address first, then the website on record, then where the client came from", async () => {
    const { changes, deps } = setup([page([
      row(1, { site: site(1, { siteUrl: "https://connected.example/" }) }),
      row(2, { website: null, sourceUrl: "https://source.example/page" }),
      row(3, { website: null, sourceUrl: null }),
    ])], { fingerprint: read("wix") });
    const results = await detectClientSites(actor, AGENCY, [id(1), id(2), id(3)], deps);
    expect(changes.recordDetection.mock.calls.map(call => (call[2] as { siteUrl: string }).siteUrl).sort()).toEqual(["https://connected.example/", "https://source.example/"]);
    expect(results.find(item => item.workspaceId === id(3))).toMatchObject({ status: "skipped", message: "No website on record." });
  });
  it("keeps going when one client fails and names the failure", async () => {
    const { deps } = setup([page([row(1), row(2)])], { fingerprint: async (url: string) => { if (url.includes("client1")) throw new Error("secret internals"); return read("wix")(); } });
    const results = await detectClientSites(actor, AGENCY, [id(1), id(2)], deps);
    expect(results.map(item => item.status)).toEqual(["failed", "ok"]);
    expect(results[0]!.message).toBe("Couldn't read this site just now.");
  });
  it("finds clients beyond the first page and refuses more than 25 at once", async () => {
    const { deps } = setup([page([row(1)], { name: "Client 01", id: id(1) }), page([row(2)])], { fingerprint: read("wix") });
    expect((await detectClientSites(actor, AGENCY, [id(2)], deps))[0]!.status).toBe("ok");
    await expect(detectClientSites(actor, AGENCY, Array.from({ length: 26 }, (_, index) => id(index + 1)), deps)).rejects.toThrow();
  });
});

describe("connectClientSite", () => {
  const connected = (patch: Record<string, unknown> = {}) => ({ id: id(901), siteHost: "client1.example", platform: "wix", ...patch }) as unknown as ConnectedSite;
  const present = (): ReturnType<NonNullable<AgencySitesDeps["present"]>> => ({ snippet: { script: '<script src="https://app.test/connect.js" data-strelva-site="sk_pub_x" defer></script>', meta: '<meta name="strelva-site-verification" content="abc">' }, systemId: id(500) });
  it("passes the detected builder to connectSite as the agency and returns the steps for it", async () => {
    const connectSite = vi.fn(async () => connected());
    const { deps } = setup([page([row(1, { detection: { siteUrl: "https://client1.example/", siteHost: "client1.example", platform: "wix", evidence: [], reachable: true, detectedAt: "2026-10-19T00:00:00Z" } })])], { connectSite, present });
    const result = await connectClientSite(actor, AGENCY, id(1), deps);
    expect(connectSite).toHaveBeenCalledWith(actor, { businessId: id(1), siteUrl: "https://client1.example/", platform: "wix" });
    expect(result.stepsText).toContain("client1.example");
    expect(result.stepsText).toContain("Wix");
    expect(result.stepsText).toContain("data-strelva-site");
  });
  it("sends no builder when none was detected", async () => {
    const connectSite = vi.fn(async () => connected({ platform: "unknown" }));
    const { deps } = setup([page([row(1)])], { connectSite, present });
    await connectClientSite(actor, AGENCY, id(1), deps);
    expect(connectSite).toHaveBeenCalledWith(actor, { businessId: id(1), siteUrl: "https://client1.example/" });
  });
  it("refuses a client where keep your site is off, with no website, or already connected", async () => {
    const connectSite = vi.fn();
    await expect(connectClientSite(actor, AGENCY, id(1), setup([page([row(1)])], { connectSite, released: async () => false }).deps)).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(connectClientSite(actor, AGENCY, id(1), setup([page([row(1, { website: null })])], { connectSite }).deps)).rejects.toThrow("No website on record");
    await expect(connectClientSite(actor, AGENCY, id(1), setup([page([row(1, { site: site(1) })])], { connectSite }).deps)).rejects.toThrow("already connected");
    expect(connectSite).not.toHaveBeenCalled();
  });
});

describe("checkClientSites", () => {
  it("verifies unproven sites, re-reads proven ones and keeps per-client failures", async () => {
    const verifySite = vi.fn(async (_a: unknown, workspaceId: string) => { if (workspaceId === id(3)) throw new WorkspaceConflictError("We couldn't find your verification tag or Strelva script on the live page yet."); return {} as ConnectedSite; });
    const checkSite = vi.fn(async (_a: unknown, _w: string, _s: string) => ({}) as ConnectedSite);
    const { deps } = setup([page([row(1, { site: site(1) }), row(2, { site: site(2, { verifiedAt: "2026-10-01T00:00:00Z" }) }), row(3, { site: site(3) }), row(4)])], { verifySite, checkSite });
    const results = await checkClientSites(actor, AGENCY, [id(1), id(2), id(3), id(4)], deps);
    expect(results).toEqual([
      { workspaceId: id(1), status: "ok" }, { workspaceId: id(2), status: "ok" },
      { workspaceId: id(3), status: "failed", message: "We couldn't find your verification tag or Strelva script on the live page yet." },
      { workspaceId: id(4), status: "skipped", message: "Get the two lines first." },
    ]);
    expect(verifySite.mock.calls.map(call => call[1])).toEqual([id(1), id(3)]);
    expect(checkSite).toHaveBeenCalledTimes(1);
    expect(checkSite.mock.calls[0]![1]).toBe(id(2));
  });
});

describe("neutral platform", () => {
  it("never recognises an agency by name", () => {
    const source = readFileSync(path.join(process.cwd(), "src/products/connected-sites/agency-sites.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/strelva agency|["']Strelva["']|agencyName|displayName|agencyWorkspaceId ===/i);
  });
});
