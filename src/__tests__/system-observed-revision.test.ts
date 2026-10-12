import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * A tenant content edit records an observed System revision (spec section 5,
 * identity gap 2), so a Possibility pinned to the old content goes stale. The
 * stale rule itself is proven in tests/system-possibilities-schema.sql.
 */
const db = vi.hoisted(() => ({ rpc: vi.fn(async (): Promise<{ data: number | null; error: null | { message: string } }> => ({ data: 1, error: null })) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: db.rpc }) }));

import { observeTenantContentVersion } from "@/lib/storage/version-store";

describe("observed revisions from tenant content edits", () => {
  afterEach(() => { vi.unstubAllEnvs(); db.rpc.mockClear(); });

  it("does nothing while Systems is not released", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "");
    await observeTenantContentVersion("mooney", "v_1");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("asks the database to observe the new version when Systems is released", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
    await observeTenantContentVersion("mooney", "v_2");
    expect(db.rpc).toHaveBeenCalledWith("observe_tenant_content", { p_tenant_id: "mooney", p_version_ref: "v_2" });
  });

  it("never fails the content write", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "function observe_tenant_content does not exist" } });
    await expect(observeTenantContentVersion("mooney", "v_3")).resolves.toBeUndefined();
    db.rpc.mockRejectedValueOnce(new Error("network"));
    await expect(observeTenantContentVersion("mooney", "v_4")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
