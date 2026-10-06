import { afterEach, describe, expect, it } from "vitest";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { setSystemsDb, systemsFromExisting, type ExistingSystemsSnapshot, type SystemsDb } from "@/platform/systems";
import { assertIsolated, createIsolatedAdapter, isolatedAdapters, prepareIsolatedPossibility } from "@/platform/make-real";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";
import { websiteRebuildCandidate, type WebsiteRebuildCandidate } from "@/products/websites/index";
import { inquiryFormUnchecked, makeRealInSandbox, projectWorkspaceSystems, readWorkspaceSystems, rebuildPossibilityId, withVersions } from "@/experience/systems/server";
import type { Observation } from "@/platform/system-health";

const BUSINESS = uuidFromSeed("business:mooney");
const TENANT_STABLE = uuidFromSeed("tenant:mooney-firm");
const INQUIRIES = uuidFromSeed("inquiries:mooney-firm");
const REBUILD = uuidFromSeed("work:rebuild");
const INTAKE = uuidFromSeed("work:intake");
const NOW = Date.parse("2026-10-05T15:00:00.000Z");
const AT = "2026-10-01T15:00:00.000Z";
const owner = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "sheri@example.test" };

function existing(overrides: Partial<ExistingSystemsSnapshot> = {}): ExistingSystemsSnapshot {
  return {
    businessId: BUSINESS,
    savedWork: [
      { id: REBUILD, productId: "websites", resourceKind: "website", title: "attymooney.com rebuild", createdAt: AT, updatedAt: AT },
      { id: INTAKE, productId: "applications", resourceKind: "application", title: "Mediation intake", createdAt: AT, updatedAt: AT, applicationStatus: "installed", applicationRelease: 2 },
    ],
    managedWebsites: [{ link: "tenant_link", tenantStableId: TENANT_STABLE, tenantId: "mooney-firm", siteName: "The Mooney Firm", tenantActive: true, linkedAt: AT }],
    inquiryWorkspaces: [{ id: INQUIRIES, tenantStableId: TENANT_STABLE, businessId: BUSINESS, createdAt: AT, updatedAt: AT }],
    bookingGrants: [],
    calendarConnections: [],
    ...overrides,
  };
}

const candidate = (extra: Partial<WebsiteRebuildCandidate> = {}): WebsiteRebuildCandidate => ({
  workId: REBUILD, title: "attymooney.com rebuild", sourceHost: "attymooney.com", tenantId: null, ready: true,
  summary: "Rebuilt.", evidence: "12 of 12 public pages carried over.", previewHref: `/api/websites/${REBUILD}/preview`, candidateRevision: 2, candidateContentHash: null, origin: "rebuild", ...extra,
});

const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const pass = (subjectId: string, signal: string, observedAt: string): Observation => ({ subjectId, signal, outcome: "pass", observedAt, maxAgeSeconds: 3600, source: "domain-monitor", message: `${signal} passed.` });

function input(snapshot = existing(), candidates = [candidate()], observations: (ids: { site: string; inquiry: string }) => Observation[] = () => []) {
  const listing = systemsFromExisting(snapshot);
  const site = listing.systems.find((item) => item.system.kind === "website" && item.references.tenantId === "mooney-firm")!.system.id;
  const inquiry = listing.systems.find((item) => item.system.kind === "inquiry")?.system.id ?? "";
  return { listing, siteDomains: new Map([["mooney-firm", "www.attymooney.com"]]), candidates, observations: observations({ site, inquiry }), actorId: owner.userId, now: NOW, ids: { site, inquiry } };
}

describe("Systems projection over the spine", () => {
  it("lists spine Systems by SystemRef and makes a saved rebuild a Ready Possibility of the website and its inquiries", async () => {
    const { ids, ...source } = input();
    const projection = await projectWorkspaceSystems(source);
    expect(projection.status).toBe("ready");
    // The rebuild's own draft listing is claimed by the Possibility: one website, not two.
    expect(projection.systems.map((item) => [item.kind, item.name, item.lifecycle])).toEqual([
      ["internal_app", "Mediation intake", "live"],
      ["website", "The Mooney Firm", "live"],
      ["inquiry", "The Mooney Firm inquiries", "live"],
    ]);
    expect(projection.systems.every((item) => item.ref.businessId === BUSINESS)).toBe(true);
    expect(projection.possibilities).toEqual([expect.objectContaining({
      id: rebuildPossibilityId(REBUILD), title: "A rebuilt attymooney.com", status: "ready",
      affects: [ids.site, ids.inquiry], workId: REBUILD, evidence: "12 of 12 public pages carried over.",
    })]);
    expect(projection.connections).toEqual([expect.objectContaining({ sourceId: ids.inquiry, kind: "appear", targetSystemId: ids.site, targetLabel: "The Mooney Firm", state: "connected" })]);
  });

  it("keeps a rebuild that is not reviewed yet Exploring, and an unmatched build its own draft website", async () => {
    const exploring = await projectWorkspaceSystems(input(existing(), [candidate({ ready: false })]));
    expect(exploring.possibilities[0]!.status).toBe("exploring");
    const unmatched = await projectWorkspaceSystems(input(existing(), [candidate({ sourceHost: "elsewhere.example" })]));
    expect(unmatched.possibilities).toEqual([]);
    expect(unmatched.systems.find((item) => item.savedWorkId === REBUILD)).toMatchObject({ kind: "website", lifecycle: "draft" });
  });

  it("matches a bound rebuild by tenant even when the hostnames differ", async () => {
    const projection = await projectWorkspaceSystems(input(existing(), [candidate({ sourceHost: null, tenantId: "mooney-firm" })]));
    expect(projection.possibilities).toHaveLength(1);
  });

  it("reports real health from evidence, keeps no evidence Unknown, and never mixes health into lifecycle", async () => {
    const paused = existing({ managedWebsites: [{ link: "tenant_link", tenantStableId: TENANT_STABLE, tenantId: "mooney-firm", siteName: "The Mooney Firm", tenantActive: false, linkedAt: AT }] });
    const { ids: _ids, ...source } = input(paused, [], ({ site, inquiry }) => [
      pass(site, "domain.uptime", ago(10)),
      inquiryFormUnchecked(inquiry),
    ]);
    const projection = await projectWorkspaceSystems(source);
    const by = (kind: string) => projection.systems.find((item) => item.kind === kind && (kind !== "website" || item.tenantId))!;
    // Paused by intent, healthy by evidence: two separate marks.
    expect(by("website")).toMatchObject({ lifecycle: "paused", health: { status: "healthy", summary: "The latest checks passed.", lastVerifiedAt: ago(10) } });
    expect(by("inquiry").health).toMatchObject({ status: "unknown", summary: "Whether the form on the site delivers has not been checked." });
    expect(by("internal_app").health).toEqual({ status: "unknown", summary: "Nothing has checked this yet.", lastVerifiedAt: null });
  });

  it("treats stale evidence as Unknown, not Working", async () => {
    const { ids: _ids, ...source } = input(existing(), [], ({ site }) => [pass(site, "domain.uptime", ago(600))]);
    const projection = await projectWorkspaceSystems(source);
    expect(projection.systems.find((item) => item.kind === "website" && item.tenantId)!.health.status).toBe("unknown");
  });

  it("reports an unreadable spine as unavailable instead of an empty business", async () => {
    setSystemsDb({ rpc: async () => ({ data: null, error: { message: "boom", code: "XX000" } }) } as unknown as SystemsDb);
    const projection = await readWorkspaceSystems({ actor: owner, businessId: BUSINESS, siteDomains: new Map(), savedWork: [] });
    expect(projection).toEqual({ status: "unavailable", systems: [], connections: [], possibilities: [] });
  });

  afterEach(() => setSystemsDb(null));
});

describe("Make real on an isolated copy", () => {
  it("stages the candidate, stops before any live switch, and says what is not connected", async () => {
    const { ids, observations: _o, ...source } = input();
    const result = await makeRealInSandbox(source, owner, rebuildPossibilityId(REBUILD), { canActivate: true });
    expect(result).toMatchObject({ isolated: true, status: "in_progress", liveUnchanged: true, waiting: [], unknown: [] });
    expect(result!.headline).toBe("In progress: 2 of 5 steps.");
    expect(result!.done.map((item) => item.mode)).toEqual(["internal", "internal"]);
    expect(result!.done[0]!.label).toBe("Prepare the new The Mooney Firm (the rebuilt attymooney.com)");
    expect(result!.notStarted).toEqual(["Switch The Mooney Firm to the new revision", "Switch The Mooney Firm inquiries to the new revision", "Run the declared operating checks"]);
    expect(JSON.stringify(result)).not.toContain(ids.site);
    expect(result!.notConnected).toEqual(["Publishing the rebuilt site at attymooney.com", "Sending contact-form messages from the rebuilt site to Inquiries"]);
  });

  it("refuses to start without owner authority and returns null for a possibility the business does not have", async () => {
    const { observations: _o, ids: _ids, ...source } = input();
    await expect(makeRealInSandbox(source, owner, rebuildPossibilityId(REBUILD), { canActivate: false })).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(makeRealInSandbox(source, owner, "website-rebuild:someone-else", { canActivate: true })).resolves.toBeNull();
  });

  it("refuses to start a possibility that is still exploring", async () => {
    const { observations: _o, ids: _ids, ...source } = input(existing(), [candidate({ ready: false })]);
    await expect(makeRealInSandbox(source, owner, rebuildPossibilityId(REBUILD), { canActivate: true })).rejects.toThrow("Only a ready possibility can be made real.");
  });

  it("is wired to isolated adapters only", async () => {
    expect(isolatedAdapters().map((adapter) => adapter.mode)).toEqual(["isolated", "isolated", "isolated", "isolated"]);
    const live = Object.assign(createIsolatedAdapter("payment"), { mode: "live" as const });
    expect(() => assertIsolated([live])).toThrow("refuses a live payment adapter");
    const sandbox = await prepareIsolatedPossibility({
      businessId: BUSINESS, possibilityId: "p", title: "T", intent: "I", ready: true, actorId: owner.userId, at: AT,
      systems: [{ ref: { businessId: BUSINESS, systemId: INTAKE }, name: "Intake", content: { v: 1 } }],
      changes: [{ systemId: INTAKE, summary: "v2", content: { v: 2 } }],
      checks: [{ id: "c", description: "Works" }],
    });
    expect(sandbox.possibility.rehearsal?.limitations[0]).toContain("no real calendar, message, payment or publish provider was called");
  });
});

describe("Website rebuild candidates", () => {
  const document = siteDocumentSchema.parse({ version: 2, siteName: "Mooney", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Mooney", description: "", root: "hero" }], nodes: { hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Mooney" }, children: [], factIds: [] } }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } });
  const payload = (status: string, extra: Record<string, unknown> = {}) => ({
    version: 2, revision: 3, title: "attymooney.com rebuild", input: { requestId: "request-1234", url: "https://www.AttyMooney.com/" }, status,
    stages: [], checkpoint: null, sourceAudit: null, audit: null,
    pageMapping: [{ sourceUrl: "https://www.attymooney.com/", targetPath: "/", carriedOver: true }, { sourceUrl: "https://www.attymooney.com/fees", targetPath: "/fees", carriedOver: false }],
    candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${REBUILD}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "owner", createdAt: AT, history: [], ...extra,
  });
  const work = (value: unknown) => ({ id: REBUILD, productId: "websites", resourceKind: "website", title: null, payload: value });

  it("reads a reviewed rebuild as a ready candidate with recorded evidence only", () => {
    expect(websiteRebuildCandidate(work(payload("review_ready")))).toMatchObject({
      workId: REBUILD, title: "attymooney.com rebuild", sourceHost: "attymooney.com", ready: true, candidateRevision: 2,
      evidence: "1 of 2 public pages carried over.", previewHref: `/api/websites/${REBUILD}/preview`,
    });
    expect(websiteRebuildCandidate(work(payload("building", { candidate: null })))!.ready).toBe(false);
  });

  it("drops published, failed, malformed and non-website work", () => {
    expect(websiteRebuildCandidate(work(payload("published")))).toBeNull();
    expect(websiteRebuildCandidate(work(payload("failed")))).toBeNull();
    expect(websiteRebuildCandidate(work({ status: "review_ready" }))).toBeNull();
    expect(websiteRebuildCandidate({ ...work(payload("review_ready")), productId: "applications" })).toBeNull();
  });
});

describe("Version lineage on the Systems projection", () => {
  const entry = (id: string) => ({ ref: { businessId: BUSINESS, systemId: id }, name: id, kind: "website", lifecycle: "live" as const, basis: null, savedWorkId: null, tenantId: null,
    health: { status: "unknown" as const, summary: "", lastVerifiedAt: null } });
  const ready = { status: "ready" as const, systems: [entry("hidden"), entry("camillus")], connections: [{ id: "c", sourceId: "camillus", kind: "depend" as const, targetSystemId: "hidden", targetLabel: "x", state: "connected" as const, purpose: null }],
    possibilities: [{ id: "p", title: "t", summary: "s", status: "ready" as const, affects: ["hidden", "camillus"], workId: "w", evidence: null, previewHref: null }] };

  it("never lists a hidden same-business source, and attaches stored Versions", () => {
    const lineage = { hiddenSources: ["hidden"], versions: [{ id: "v", systemId: "camillus", source: { businessId: BUSINESS, systemId: "hidden", name: "Site", hidden: true },
      context: { kind: "location", label: "Camillus" }, baselineRevision: 1, latestRevision: 1, currentRelease: null, declined: [], siblings: [] }] };
    const joined = withVersions(ready, lineage);
    expect(joined.systems.map((item) => item.ref.systemId)).toEqual(["camillus"]);
    expect(joined.connections).toEqual([]);
    expect(joined.possibilities[0]!.affects).toEqual(["camillus"]);
    expect(joined.versions).toHaveLength(1);
  });

  it("claims no lineage when it could not be read, and leaves an unavailable spine alone", () => {
    expect(withVersions(ready, null)).toBe(ready);
    const down = { status: "unavailable" as const, systems: [], connections: [], possibilities: [] };
    expect(withVersions(down, { hiddenSources: [], versions: [] })).toBe(down);
  });
});
