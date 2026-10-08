import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/systems/from-existing", async importOriginal => ({
  ...await importOriginal<typeof import("@/platform/systems/from-existing")>(),
  listBusinessSystems: vi.fn(async (_actor, businessId) => ({ businessId, systems: [], connections: [] })),
}));
vi.mock("@/platform/possibilities/supabase-repository", () => ({
  createSupabasePossibilityRepository: () => ({ listWithSources: async () => { throw new Error("Saved pins unavailable"); } }),
}));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: async () => false }));
vi.mock("@/platform/catalog-reports/tool-history", () => ({ readToolReleases: async () => [] }));
vi.mock("@/platform/system-versions/supabase-store", () => ({ readBusinessVersions: async () => null }));
import { readWorkspaceSystems } from "@/experience/systems/server";

const deps = { actor: { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" }, businessId: "22222222-2222-4222-8222-222222222222", siteDomains: new Map<string, string>(), savedWork: [] };

describe("saved-state read failure", () => {
  it("fails closed on a read-only refresh instead of accepting a freshly derived projection", async () => {
    expect(await readWorkspaceSystems({ ...deps, canWrite: false, readOnly: true })).toEqual({ status: "unavailable", systems: [], connections: [], possibilities: [] });
  });
  it("preserves ordinary owner GET projection compatibility", async () => {
    expect((await readWorkspaceSystems({ ...deps, canWrite: true })).status).toBe("ready");
  });
  it("preserves ordinary member GET fallback compatibility", async () => {
    expect((await readWorkspaceSystems({ ...deps, canWrite: false })).status).toBe("ready");
  });
});
