import { describe, expect, it, vi } from "vitest";
import type { ProviderAccess } from "@/platform/connections/contracts";
import { createEmailConnectionSource, type EmailConnectionSourceDependencies } from "@/platform/infra/email/connection-source";
import type { EmailBusinessContext } from "@/platform/infra/email/business-context";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const access: ProviderAccess = { provider: "resend", through: { kind: "platform" }, approval: "not_required" };
const context: EmailBusinessContext = { workspaceId, tenantIds: ["harbor-dental"], ownerAuthorship: "platform", businessName: "Harbor Dental", replyTo: "hello@example.test", timeZone: "America/New_York" };
function fixture(extra: Partial<EmailConnectionSourceDependencies> = {}) {
  const deps = { customerEnabled: () => true, clientEnabled: () => true, context: vi.fn(async () => context), override: vi.fn(async () => "inherit" as const), isBusinessWorkspace: vi.fn(async () => true), ...extra };
  return { deps, source: createEmailConnectionSource(deps) };
}

describe("Email Connections source", () => {
  it("shows platform-held business email policy using existing scoped exclusions", async () => {
    const { source, deps } = fixture();
    expect(await source.list({ workspaceId, access })).toEqual([{
      ref: `resend:${workspaceId}`, provider: "resend", workspaceId, accountLabel: "Business customer email is on",
      accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" }, state: "connected",
      unavailableReason: null, connectedAt: null, systemIds: [],
    }]);
    expect(deps.override).toHaveBeenCalledWith(`workspace:${workspaceId}`, { failClosed: true });
    expect(deps.override).toHaveBeenCalledWith("harbor-dental", { failClosed: true });
  });

  it.each(["clientEnabled", "customerEnabled"] as const)("keeps business email off when %s is off without reading settings", async field => {
    const { source, deps } = fixture({ [field]: () => false });
    const [row] = await source.list({ workspaceId, access });
    expect(row?.state).toBe("disconnected");
    expect(row?.accountLabel).toBe("Business customer email is off");
    expect(deps.context).not.toHaveBeenCalled();
    expect(deps.override).not.toHaveBeenCalled();
  });

  it.each([`workspace:${workspaceId}`, "harbor-dental"])("an exclusion at %s holds email despite another scope being armed", async off => {
    const { source } = fixture({ override: async scope => scope === off ? "off" : "on" });
    expect((await source.list({ workspaceId, access }))[0]?.state).toBe("disconnected");
  });

  it.each([null, { ...context, workspaceId: "33333333-3333-4333-8333-333333333333" }, { ...context, businessName: null }, { ...context, replyTo: null }])("rejects unknown/mismatched business identity: %j", async data => {
    await expect(fixture({ context: async () => data }).source.list({ workspaceId, access })).rejects.toThrow(/could not be confirmed/);
  });

  it("reports settings failure to the per-source boundary", async () => {
    await expect(fixture({ override: async () => { throw new Error("offline"); } }).source.list({ workspaceId, access })).rejects.toThrow("offline");
  });

  it.each([
    { ...access, approval: "pending" as const }, { ...access, approval: "none" as const },
    { ...access, through: { kind: "unknown" as const } },
    { ...access, through: { kind: "agency" as const, workspaceId } },
  ])("holds ineligible provider access with no storage or send path: %j", async denied => {
    const { source, deps } = fixture();
    expect((await source.list({ workspaceId, access: denied }))[0]?.state).toBe("unavailable");
    expect(deps.context).not.toHaveBeenCalled();
  });

  it("does not expose business identity, recipient or reply address in the row", async () => {
    const rows = await fixture().source.list({ workspaceId, access });
    expect(JSON.stringify(rows)).not.toMatch(/hello@example|Harbor Dental|harbor-dental/);
  });

  it("does not show a business customer email row for agency or personal workspaces", async () => {
    const { source, deps } = fixture({ isBusinessWorkspace: async () => false });
    expect(await source.list({ workspaceId, access })).toEqual([]);
    expect(deps.context).not.toHaveBeenCalled();
    expect(deps.override).not.toHaveBeenCalled();
  });

  it("reports unknown workspace identity at the source-error boundary", async () => {
    const { source, deps } = fixture({ isBusinessWorkspace: async () => { throw new Error("workspace unknown"); } });
    await expect(source.list({ workspaceId, access })).rejects.toThrow("workspace unknown");
    expect(deps.context).not.toHaveBeenCalled();
  });
});
