/**
 * Client-repo /api/v1 contracts, proven by execution.
 *
 * `release-manifest.json` lists every client repo, the v1 endpoints it calls,
 * and a fixture body shaped exactly like what its call site sends. This suite
 * runs the REAL route handlers against those fixtures (Redis, tenant config and
 * the lead store mocked the way the route tests mock them) and asserts the
 * status + body the repo depends on. `pnpm check:custom-repos` proves the other
 * half statically: the repo's file at the pinned commit really sends those
 * fields to that path (scripts/custom-repo-v1-contracts.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";
import {
  V1_ROUTE_CONTRACTS,
  checkV1CallSites,
  resolveStringConstants,
  sendsField,
  stripComments,
  type V1CallSite,
} from "../../scripts/custom-repo-v1-contracts";
import { resolveRepoChecks, type WorkspaceManifest } from "../../scripts/custom-repo-workspace-check";
import { isTenantId } from "@/lib/scaffold-contracts";

const mockRedis = makeRedisMock();
const mocks = vi.hoisted(() => ({
  tenant: vi.fn(),
  capture: vi.fn(),
  legacy: vi.fn(),
  trackClick: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/lib/leads", () => ({ captureLead: mocks.capture, recordLead: mocks.legacy }));
vi.mock("@/lib/storage", () => ({ trackClick: mocks.trackClick }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "k" }));

import { POST as LEADS_POST } from "@/app/api/v1/leads/[tenant]/route";
import { POST as TRACK_POST } from "@/app/api/v1/track/[tenant]/route";
import { POST as SPAM_PIT_POST } from "@/app/api/v1/spam-pit/[tenant]/route";
import { getSpam } from "@/lib/spam-pit";

type ManifestRepo = NonNullable<NonNullable<WorkspaceManifest["customRepoWorkspace"]>["repos"]>[number];

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8")) as WorkspaceManifest;
const repos = manifest.customRepoWorkspace!.repos! as ManifestRepo[];

const HANDLERS: Record<string, (req: Request, ctx: { params: Promise<{ tenant: string }> }) => Promise<Response>> = {
  leads: LEADS_POST,
  track: TRACK_POST,
  "spam-pit": SPAM_PIT_POST,
};

const WRITE_KEY = "contract-write-key";

function request(tenant: string, site: V1CallSite, body: Record<string, unknown>): Request {
  const headers: Record<string, string> = {
    // sendBeacon(new Blob([json], { type: "text/plain" })) is what the tracker sends.
    "Content-Type": site.transport === "beacon-text" ? "text/plain;charset=UTF-8" : "application/json",
    "x-forwarded-for": "203.0.113.20",
  };
  if (site.auth === "spam-pit-write-key") headers.Authorization = `Bearer ${WRITE_KEY}`;
  return new Request(`https://app.strelva.test/api/v1/${site.endpoint}/${tenant}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRedis.store.clear();
  mockRedis.zsets.clear();
  mocks.tenant.mockReset();
  mocks.tenant.mockImplementation(async (id: string) => ({ id, active: true }));
  mocks.capture.mockReset();
  mocks.capture.mockImplementation(async (_tenant: string, input: Record<string, unknown>) => ({
    status: "captured",
    lead: { id: "lead_1", createdAt: "2026-10-05T12:00:00.000Z", ...input },
  }));
  mocks.legacy.mockReset();
  mocks.legacy.mockResolvedValue(undefined);
  mocks.trackClick.mockReset();
  mocks.trackClick.mockResolvedValue(undefined);
  process.env.SPAM_PIT_WRITE_KEY = WRITE_KEY;
});

describe("release-manifest.json client-repo inventory", () => {
  it("lists all nine client repos once", () => {
    expect(repos.map((repo) => repo.localPath).sort()).toEqual([
      "../cocard-anderson",
      "../greatlakesdriedfruits",
      "../leslie-bookkeeping",
      "../mclears-cottage",
      "../orange-crate-brewing",
      "../rhm-innovations",
      "../rohlax-wellness",
      "../smokin-buddha",
      "../vermont-unlimited",
    ]);
    expect(new Set(repos.map((repo) => repo.tenant)).size).toBe(repos.length);
  });

  it("gives every repo a valid tenant slug, a full pin, and a v1Endpoints list", () => {
    for (const repo of repos) {
      expect(isTenantId(repo.tenant), repo.tenant).toBe(true);
      expect(repo.compatibleCommit, repo.tenant).toMatch(/^[0-9a-f]{40}$/);
      expect(Array.isArray(repo.v1Endpoints), repo.tenant).toBe(true);
    }
  });

  it("marks an unconfirmed slug instead of presenting it as fact", () => {
    for (const repo of repos.filter((r) => r.tenantConfirmed === false)) {
      expect(repo.tenantEvidence, repo.tenant).toMatch(/^UNCONFIRMED/);
    }
  });

  it("every endpoint has a platform contract and every POST call site carries a runnable fixture", () => {
    for (const repo of repos) {
      for (const endpoint of repo.v1Endpoints ?? []) expect(V1_ROUTE_CONTRACTS[endpoint], endpoint).toBeDefined();
      for (const site of repo.v1CallSites ?? []) {
        if (V1_ROUTE_CONTRACTS[site.endpoint]!.method !== "POST") continue;
        expect(HANDLERS[site.endpoint], site.endpoint).toBeDefined();
        expect(site.fixtures?.length, `${repo.tenant} ${site.endpoint}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the content-contract baseline for gldf/rohlax and resolves named profiles for the rest", () => {
    const checks = resolveRepoChecks(manifest, "/w", "/w/REB");
    const baselineFiles = manifest.customRepoWorkspace!.baseline!.requiredFiles!;
    for (const tenant of ["gldf", "rohlax"]) {
      const check = checks.find((c) => c.tenant === tenant)!;
      expect(check.profile).toBe("baseline");
      expect(check.requiredFiles).toEqual(expect.arrayContaining(baselineFiles));
      expect(check.releaseRequiredEnv).toContain("REB_API_URL");
    }
    for (const check of checks.filter((c) => c.tenant !== "gldf" && c.tenant !== "rohlax")) {
      expect(manifest.customRepoWorkspace!.profiles![check.profile], check.tenant).toBeDefined();
      expect(check.requiredFiles).not.toContain("src/lib/reb-contracts.ts");
    }
  });
});

describe("V1_ROUTE_CONTRACTS matches the route sources", () => {
  for (const [endpoint, contract] of Object.entries(V1_ROUTE_CONTRACTS)) {
    it(`${endpoint}: the route reads every listed field`, () => {
      const source = readFileSync(path.join(process.cwd(), contract.routeFile), "utf8");
      const destructured = [...source.matchAll(/const\s*\{([^}]*)\}\s*=\s*body\b/g)]
        .flatMap((m) => m[1]!.split(",").map((s) => s.trim()));
      for (const field of contract.reads ?? []) {
        const read = new RegExp(`body\\.${field}\\b`).test(source) || destructured.includes(field);
        expect(read, `${contract.routeFile} does not read body.${field}`).toBe(true);
      }
    });
  }

  it("leads rejects a body without name; track rejects a body without event", async () => {
    const site = (endpoint: string): V1CallSite => ({ endpoint, file: "x", transport: "json" });
    const leads = await LEADS_POST(request("mclears", site("leads"), { email: "a@example.com", message: "hi" }), {
      params: Promise.resolve({ tenant: "mclears" }),
    });
    expect(leads.status).toBe(400);
    const track = await TRACK_POST(request("mclears", site("track"), { serviceId: "x" }), {
      params: Promise.resolve({ tenant: "mclears" }),
    });
    expect(track.status).toBe(400);
  });
});

describe("each client repo's v1 calls, run against the real route handlers", () => {
  const cases = repos.flatMap((repo) =>
    (repo.v1CallSites ?? []).flatMap((site) =>
      (site.fixtures ?? []).map((fixture) => ({ repo, site, fixture })),
    ),
  );

  it("has fixtures for leads, track and spam-pit", () => {
    expect(new Set(cases.map((c) => c.site.endpoint))).toEqual(new Set(["leads", "track", "spam-pit"]));
  });

  for (const { repo, site, fixture } of cases) {
    it(`${repo.tenant} → POST /api/v1/${site.endpoint}/${repo.tenant} (${fixture.name})`, async () => {
      const handler = HANDLERS[site.endpoint]!;
      const res = await handler(request(repo.tenant, site, fixture.body), {
        params: Promise.resolve({ tenant: repo.tenant }),
      });
      expect(res.status).toBe(fixture.expectStatus);
      const body = await res.json();
      if (fixture.expectBody) expect(body).toMatchObject(fixture.expectBody);

      if (site.endpoint === "leads") {
        const calls = [...mocks.legacy.mock.calls, ...mocks.capture.mock.calls];
        expect(calls, "the lead was not stored").toHaveLength(1);
        const [tenant, stored] = calls[0]!;
        expect(tenant).toBe(repo.tenant);
        expect(stored).toMatchObject({
          name: fixture.body.name,
          message: fixture.body.message,
          source: fixture.body.source,
          ...(fixture.body.email ? { email: fixture.body.email } : {}),
        });
      }
      if (site.endpoint === "track") {
        expect(mocks.trackClick).toHaveBeenCalledWith(fixture.body.event, repo.tenant);
      }
      if (site.endpoint === "spam-pit") {
        const pit = await getSpam(repo.tenant);
        expect(pit).toHaveLength(1);
        expect(pit[0]).toMatchObject({ reason: fixture.body.reason, name: fixture.body.name, source: fixture.body.source });
      }
    });
  }

  it("a spam-pit call without the write key is refused (cocard falls back to its log)", async () => {
    const res = await SPAM_PIT_POST(
      new Request("https://app.strelva.test/api/v1/spam-pit/cocard-anderson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "honeypot" }),
      }),
      { params: Promise.resolve({ tenant: "cocard-anderson" }) },
    );
    expect(res.status).toBe(401);
  });

  it("a beacon for a tenant the platform does not know returns 404 (what an unprovisioned slug gets)", async () => {
    mocks.tenant.mockResolvedValue(null);
    const site: V1CallSite = { endpoint: "track", file: "x", transport: "beacon-text" };
    const res = await TRACK_POST(request("smokin-buddha", site, { event: "page-view" }), {
      params: Promise.resolve({ tenant: "smokin-buddha" }),
    });
    expect(res.status).toBe(404);
    expect(mocks.trackClick).not.toHaveBeenCalled();
  });
});

describe("checkV1CallSites static analysis", () => {
  const leadsSite: V1CallSite = {
    endpoint: "leads",
    file: "route.ts",
    bodyFields: ["name", "email", "message", "source"],
    fixtures: [{ name: "f", body: { name: "A", source: "Contact" }, expectStatus: 200 }],
  };
  const run = (source: string | null, site: V1CallSite = leadsSite, tenant = "mclears", endpoints = ["leads"]) =>
    checkV1CallSites({ tenant, v1Endpoints: endpoints, callSites: [site], readSource: () => source });
  const failures = (results: ReturnType<typeof run>) => results.filter((r) => !r.ok).map((r) => r.name);
  const good = "await fetch(`${base}/api/v1/leads/${tenant}`, { body: JSON.stringify({ name, email: replyTo, message, source: formName }) });";

  it("passes the mclears call shape", () => {
    expect(failures(run(good))).toEqual([]);
  });

  it("resolves same-file version constants in the path", () => {
    const src = 'const CONTRACT_VERSION = "v1";\nconst url = `${baseUrl}/api/${CONTRACT_VERSION}/track/${tenant}`;\nconst payload = { event };';
    expect(resolveStringConstants(src)).toContain("/api/v1/track/${tenant}");
    expect(failures(run(src, { endpoint: "track", file: "t.tsx", bodyFields: ["event"] }, "x", ["track"]))).toEqual([]);
  });

  it("does not count a path that only appears in a comment (the orange-crate case)", () => {
    const src = "/**\n * use ScaffoldLeadForm.tsx → `/api/v1/leads/{tenant}` instead\n */\nexport const x = 1; // { name, email, message, source }";
    expect(stripComments(src)).not.toContain("/api/v1/leads/");
    expect(failures(run(src))).toContain("mclears:v1:leads:route.ts:path");
  });

  it("fails a hard-coded tenant that is not the manifest tenant", () => {
    const src = "fetch('https://app.strelva.com/api/v1/spam-pit/someone-else', { body: JSON.stringify({ reason, name }) })";
    const site: V1CallSite = { endpoint: "spam-pit", file: "api/contact.js", bodyFields: ["reason", "name"] };
    expect(failures(run(src, site, "cocard-anderson", ["spam-pit"]))).toContain("cocard-anderson:v1:spam-pit:api/contact.js:tenant-segment");
  });

  it("fails a declared field the file never sends, a field the route never reads, and a missing required field", () => {
    const notSent = run("fetch(`/api/v1/leads/${t}`, { body: JSON.stringify({ name, message, source }) })");
    expect(failures(notSent)).toContain("mclears:v1:leads:route.ts:body-fields-sent");
    const unread = run(good.replace("source: formName", "source: formName, phone"), { ...leadsSite, bodyFields: [...leadsSite.bodyFields!, "phone"] });
    expect(failures(unread)).toContain("mclears:v1:leads:route.ts:body-fields-read");
    const noName = run("fetch(`/api/v1/leads/${t}`, { body: JSON.stringify({ email, message }) })", { ...leadsSite, bodyFields: ["email", "message"], fixtures: [] });
    expect(failures(noName)).toContain("mclears:v1:leads:route.ts:required-fields");
  });

  it("fails a fixture that sends fields the repo does not", () => {
    const site = { ...leadsSite, fixtures: [{ name: "bad", body: { name: "A", phone: "1" }, expectStatus: 200 }] };
    expect(failures(run(good, site))).toContain("mclears:v1:leads:route.ts:fixture:bad");
  });

  it("fails an endpoint with no evidence file, an unknown endpoint, and a missing file", () => {
    const results = checkV1CallSites({ tenant: "x", v1Endpoints: ["leads", "nope"], callSites: [], readSource: () => null });
    expect(failures(results)).toEqual(expect.arrayContaining([
      "x:v1:leads:call-site-declared",
      "x:v1:nope:known-route",
    ]));
    expect(failures(run(null))).toContain("mclears:v1:leads:route.ts:file");
  });

  it("recognises object keys and property assignment as sent fields", () => {
    expect(sendsField("const payload = { event };", "event")).toBe(true);
    expect(sendsField("payload.orderId = x;", "orderId")).toBe(true);
    expect(sendsField("if (payload.orderId === x)", "orderId")).toBe(false);
    expect(sendsField("const orderIdentifier = 1", "orderId")).toBe(false);
  });
});
