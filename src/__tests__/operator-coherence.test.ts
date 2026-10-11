import { describe, expect, it, vi, beforeEach } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { strelvaAgencySeat, agencyEntryHref } from "@/experience/operator/agency-entry";
import { OPERATOR_DESTINATIONS, operatorDestination, operatorDestinations } from "@/experience/operator/destinations";
import { workspaceHref } from "@/app/admin/work/workspace-href";

const reads = vi.hoisted(() => ({ enabled: vi.fn(), actor: vi.fn(), businesses: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: reads.enabled }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: reads.actor }));
vi.mock("@/platform/business-effort/repository", () => ({ PostgresBusinessEffortStore: { listBusinesses: reads.businesses } }));
import { readClientBusinessCount } from "@/app/admin/client-businesses";

function pages(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(join(root, entry.name)) : entry.name === "page.tsx" ? [root.replace(/^src\/app/, "")] : []);
}

describe("operator destination coverage", () => {
  it("covers every reachable admin page, including retained bookmarks and detail routes", () => {
    for (const path of pages("src/app/admin")) expect(operatorDestination(path), path).toBeDefined();
    expect(operatorDestination("/admin/tenant-cleanup/mooney")?.label).toBe("Site cleanup recovery");
    expect(operatorDestinations().some(item => item.href === "/admin/money")).toBe(false);
    expect(operatorDestinations({ moneyEnabled: true }).some(item => item.href === "/admin/money")).toBe(true);
    expect(operatorDestinations({ preview: true }).map(item => item.label)).toEqual(["Queue", "Checks", "Sites"]);
    expect(new Set(Object.values(OPERATOR_DESTINATIONS).map(item => item.href)).size).toBe(Object.keys(OPERATOR_DESTINATIONS).length);
  });
});

describe("ordinary Strelva Agency entry", () => {
  const agency = { id: "agency-id", name: "Strelva Agency", role: "member" as const };
  it("never substitutes another agency or ambiguous identity for the acting agency", () => {
    expect(strelvaAgencySeat([agency])?.id).toBe("agency-id");
    expect(strelvaAgencySeat([])).toBeNull();
    expect(strelvaAgencySeat([{ ...agency, name: "North Studio" }])).toBeNull();
    expect(strelvaAgencySeat([agency, { ...agency, id: "other-id" }])).toBeNull();
  });
  it("leaves the operator host, carries verified agency scope and respects add-client rollout", () => {
    const base = workspaceHref("admin.strelva.com", "https", "home");
    expect(agencyEntryHref(base, "agency-id", "queue", true)).toBe("https://app.strelva.com/workspace?workspace=agency-id&view=home&agencyView=queue");
    expect(agencyEntryHref(base, "agency-id", "onboard", true)).toBe("https://app.strelva.com/workspace/agency/clients/new?workspaceId=agency-id");
    expect(agencyEntryHref(base, "agency-id", "onboard", false)).toContain("agencyView=clients");
    expect(agencyEntryHref(workspaceHref("admin.localhost:3119", "http", "home"), "agency-id", "queue", true)).toContain("http://localhost:3119/workspace?workspace=agency-id");
  });
});

describe("operator client business count", () => {
  beforeEach(() => { vi.clearAllMocks(); reads.enabled.mockReturnValue(true); reads.actor.mockResolvedValue({ userId: "operator", verifiedEmail: "operator@example.test" }); });
  it("counts distinct business IDs, regardless of how many sites each has", async () => {
    reads.businesses.mockResolvedValue([{ id: "business-one", tenantIds: ["one", "two"] }, { id: "business-two", tenantIds: [] }, { id: "business-one", tenantIds: ["three"] }]);
    expect(await readClientBusinessCount()).toBe(2);
    expect(reads.businesses).toHaveBeenCalledWith({ userId: "operator", verifiedEmail: "operator@example.test" });
  });
  it("keeps missing storage, unavailable identity and closed rollout unknown", async () => {
    reads.businesses.mockRejectedValue(new Error("unavailable"));
    expect(await readClientBusinessCount()).toBeNull();
    reads.actor.mockResolvedValue(null); reads.businesses.mockClear();
    expect(await readClientBusinessCount()).toBeNull(); expect(reads.businesses).not.toHaveBeenCalled();
    reads.enabled.mockReturnValue(false); reads.actor.mockClear();
    expect(await readClientBusinessCount()).toBeNull(); expect(reads.actor).not.toHaveBeenCalled();
  });
});
