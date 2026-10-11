import { describe, expect, it, vi } from "vitest";
import { runProviderRepath, type ProviderRepathDeps, type ProviderRepathOptions } from "../../scripts/provider-repath";
import { providerRepathResultSchema } from "@/platform/business-record/contracts";

const route = {
  agencyWorkspaceId: "77777777-7777-4777-8777-777777777777",
  selectionBasis: "existing_contract" as const,
  source: "tenant_conversion" as const,
  providerId: null,
  providerCreatedByConversion: true,
  providerToEndId: "88888888-8888-4888-8888-888888888888",
  providerToEndWorkspaceId: "99999999-9999-4999-8999-999999999999",
  seatId: null,
  seatGrantedByKind: "conversion" as const,
  staff: [{ staffId: null, userId: "66666666-6666-4666-8666-666666666666", email: "staff@agency.example.test", createdByConversion: true }],
  routedAt: null,
};
const result = providerRepathResultSchema.parse({
  tenantId: "legacy-site",
  workspaceId: "44444444-4444-4444-8444-444444444444",
  providerRoute: route,
  staffToAdd: ["staff@agency.example.test"],
  legacyAdminMemberships: 1,
  legacyAdminMembershipsRemoved: 0,
  alreadyRouted: false,
  applied: false,
});
const base: ProviderRepathOptions = {
  tenantId: "legacy-site",
  operatorEmail: "operator@strelva.example.test",
  agencyWorkspaceId: route.agencyWorkspaceId,
  agencyStaffEmails: ["staff@agency.example.test"],
  agencySelectionBasis: "existing_contract",
  apply: false,
  jacobsYes: false,
  databaseUrl: "http://127.0.0.1:54321",
};

function deps() {
  const lines: string[] = [];
  const repath = vi.fn<ProviderRepathDeps["repath"]>(async () => result);
  const value: ProviderRepathDeps = { repath, log: (line) => lines.push(line) };
  return { value, repath, lines };
}

describe("converted tenant provider re-route", () => {
  it("previews the explicit agency and names the old admin path without writing", async () => {
    const { value, repath, lines } = deps();
    const outcome = await runProviderRepath(base, value);
    expect(outcome.mode).toBe("dry-run");
    expect(repath).toHaveBeenCalledWith("operator@strelva.example.test", "legacy-site", {
      agencyWorkspaceId: route.agencyWorkspaceId,
      agencyStaffEmails: ["staff@agency.example.test"],
      agencySelectionBasis: "existing_contract",
    }, false);
    expect(lines.join("\n")).toContain("legacy conversion admin memberships: 1; removed=0");
    expect(lines.join("\n")).toContain("legacy provider attribution to end");
    expect(lines.join("\n")).toContain("owner invitation/email: unchanged and not sent");
    expect(lines.at(-1)).toBe("Dry run: nothing was written.");
  });

  it("requires complete route inputs and a database even for preview", async () => {
    const { value, repath } = deps();
    await expect(runProviderRepath({ ...base, agencyWorkspaceId: undefined }, value)).rejects.toThrow(/no default/);
    await expect(runProviderRepath({ ...base, agencyStaffEmails: [] }, value)).rejects.toThrow(/agency-staff/);
    await expect(runProviderRepath({ ...base, agencySelectionBasis: undefined }, value)).rejects.toThrow(/agency-basis/);
    await expect(runProviderRepath({ ...base, operatorEmail: undefined }, value)).rejects.toThrow(/super admin/);
    await expect(runProviderRepath({ ...base, databaseUrl: undefined }, value)).rejects.toThrow(/database connection/);
    expect(repath).not.toHaveBeenCalled();
  });

  it("requires Jacob's yes for a non-loopback apply and applies on a local copy", async () => {
    const { value, repath } = deps();
    await expect(runProviderRepath({ ...base, apply: true, databaseUrl: "https://db.example.test" }, value)).rejects.toThrow(/Jacob's yes/);
    expect(repath).not.toHaveBeenCalled();
    const outcome = await runProviderRepath({ ...base, apply: true }, value);
    expect(outcome.mode).toBe("apply");
    expect(repath).toHaveBeenCalledTimes(1);
    expect(repath).toHaveBeenCalledWith("operator@strelva.example.test", "legacy-site", {
      agencyWorkspaceId: route.agencyWorkspaceId,
      agencyStaffEmails: ["staff@agency.example.test"],
      agencySelectionBasis: "existing_contract",
    }, true);
  });
});
