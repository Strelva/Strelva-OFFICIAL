import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planTenantImport, type TenantImportSource } from "@/platform/business-record/tenant-import";

const fixtures = join(process.cwd(), "tests/fixtures");
const source = (): TenantImportSource => JSON.parse(readFileSync(join(fixtures, "business-record-tenant-source.json"), "utf8"));

describe("tenant import planner", () => {
  it("builds exactly the import the SQL conversion test applies", () => {
    const committed = JSON.parse(readFileSync(join(fixtures, "business-record-tenant-import.json"), "utf8"));
    const plan = planTenantImport(source());
    expect({ commandId: plan.commandId, digest: plan.digest, payload: plan.payload }).toEqual(committed);
  });

  it("is deterministic and independent of reader order", () => {
    const first = planTenantImport(source());
    const shuffled = source();
    shuffled.leads = [...(shuffled.leads ?? [])].reverse();
    shuffled.bookings = [...(shuffled.bookings ?? [])].reverse();
    const second = planTenantImport(shuffled);
    expect(second.digest).toBe(first.digest);
    expect(second.commandId).toBe(first.commandId);
  });

  it("maps tenant fields to typed facts with nothing invented", () => {
    const plan = planTenantImport(source());
    const facts = plan.payload.patch.facts!;
    expect(facts.legal_name).toBeUndefined();
    expect(plan.skipped).toContainEqual({ field: "legal_name", reason: "the tenant does not record a legal name" });
    expect(facts.owner_recipient?.value).toEqual({ email: "owner@example.com", name: "Pat Example" });
    expect(facts.service_area?.value).toEqual(["Buffalo, NY", "Amherst, NY"]);
    expect(Object.values(facts).every((entry) => entry?.verified === false)).toBe(true);
    expect(plan.counts).toMatchObject({ facts: 9, services: 2, people: 1, contacts: 5, contactsSkipped: 1 });
  });

  it("keeps booking availability out of business hours when the tenant has no hours", () => {
    const input = source();
    delete input.tenant.businessHours;
    const plan = planTenantImport(input);
    expect(plan.payload.patch.facts?.hours).toBeUndefined();
    expect(plan.skipped.some((item) => item.field === "tenant.businessHours")).toBe(true);
  });

  it("does not turn a business-named owner into a person", () => {
    const input = source();
    input.tenant.ownerName = "Great Lakes Dried Fruit";
    expect(planTenantImport(input).payload.patch.people).toBeUndefined();
  });

  it("names a multi-site account's business after the account and records billing", () => {
    const input = source();
    input.account = { id: "acct-1", name: "Twin Trees", tenantIds: ["a", "b"], multiSite: true };
    const plan = planTenantImport(input, { targetWorkspaceId: "11111111-1111-4111-8111-111111111111" });
    expect(plan.payload.workspaceName).toBe("Twin Trees");
    expect(plan.payload.targetWorkspaceId).toBe("11111111-1111-4111-8111-111111111111");
    expect(plan.payload.billing?.grandfathered).toBe(true);
    expect(plan.digest).not.toBe(planTenantImport(source()).digest);
  });

  it("names a separate business after the site and marks it, never with a join target", () => {
    const input = source();
    input.account = { id: "acct-1", name: "Twin Trees", tenantIds: ["a", "b"], multiSite: true };
    const plan = planTenantImport(input, { separateBusiness: true });
    expect(plan.payload.workspaceName).toBe(input.tenant.siteName);
    expect(plan.payload.separateBusiness).toBe(true);
    expect(plan.payload.account?.multiSite).toBe(true);
    expect(planTenantImport(input).payload).not.toHaveProperty("separateBusiness");
    expect(() => planTenantImport(input, { separateBusiness: true, targetWorkspaceId: "11111111-1111-4111-8111-111111111111" })).toThrow(/cannot also join/);
  });

  it("flags a tenant without a stable id as not appliable", () => {
    const input = source();
    delete input.tenant.stableId;
    expect(planTenantImport(input).skipped.some((item) => item.field === "tenant.stableId")).toBe(true);
  });
});
