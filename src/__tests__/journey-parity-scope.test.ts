import { describe, expect, it } from "vitest";
import { assertKnownParityTenants, assertOwnedParityRuntime, type ParityRuntime, type ParityTenant } from "../../tests/support/journey-parity-scope";
const runtime: ParityRuntime = { proofMode: "1", authUrl: "http://127.0.0.1:61411", appUrl: "http://localhost:55850", databaseUrl: "postgresql://127.0.0.1:61412/postgres", stackDirectory: "/tmp/owned/strelva-auth.8r1EGY", stackConfig: 'project_id = "strelva-proof-00cf2aa2ffbff459"\n[api]\nport = 61411\n[db]\nport = 61412\n' };
const native: ParityTenant = { id: "elmwood-bakery-d5d836fdb5ff", stableId: "7f000000-0000-4000-8000-000000000010", native: { tenantId: "elmwood-bakery-d5d836fdb5ff", tenantStableId: "7f000000-0000-4000-8000-000000000010", workspaceMatches: true, actorMatches: true, verifiedActor: true, agencyOwner: true, actorEmail: "local-workflow-agency-ae91b48f-31f6-4452-9289-d6e13a35858c@example.test", agencyName: "Northside Web Care", agencyKind: "agency", businessName: "Elmwood Bakery", businessKind: "customer", sourceKind: "url", sourceUrl: "http://elmwood-source.example/", productId: "websites", resourceKind: "website" } };
describe("owned synthetic journey parity scope", () => {
  it("accepts actual configured disposable stack ports", () => expect(() => assertOwnedParityRuntime(runtime)).not.toThrow());
  it.each([
    { proofMode: "0" }, { databaseUrl: "postgresql://127.0.0.1:61412/postgres?host=production.example.com" }, { authUrl: "ftp://127.0.0.1:61411" }, { authUrl: "https://example.supabase.co" }, { appUrl: "https://app.example.com" },
    { databaseUrl: "postgresql://127.0.0.1:5555/postgres" }, { authUrl: "http://127.0.0.1:5555" },
    { stackDirectory: "/tmp/customer-production" }, { stackConfig: runtime.stackConfig.replace("strelva-proof-", "production-") },
  ])("rejects unowned or mismatched runtime %j", change => expect(() => assertOwnedParityRuntime({ ...runtime, ...change })).toThrow("owned local Auth"));
  it("keeps existing synthetic identities and admits the full linked native fixture", () => {
    expect(assertKnownParityTenants([{ id: "journeys-parity", stableId: "a", native: null }, { id: "j10-1234abcd", stableId: "b", native: null }, native])).toEqual(["a", "b", native.stableId]);
  });
  it("refuses a matching name without native provenance and unrelated tenants", () => {
    expect(() => assertKnownParityTenants([{ ...native, native: null }])).toThrow("Unexpected tenant");
    expect(() => assertKnownParityTenants([{ id: "real-customer", stableId: "c", native: null }])).toThrow("Unexpected tenant");
  });
  it.each([
    { tenantId: "different-tenant" }, { tenantStableId: "different-id" }, { workspaceMatches: false }, { actorMatches: false },
    { verifiedActor: false }, { agencyOwner: false }, { actorEmail: "real-owner@example.com" }, { agencyName: "Other agency" },
    { agencyKind: "customer" }, { businessName: "Other business" }, { businessKind: "agency" }, { sourceKind: "prospect" },
    { sourceUrl: "https://customer.example.com" }, { productId: "tracker" }, { resourceKind: "tracker" },
  ])("refuses broken native fixture provenance %j", change => {
    expect(() => assertKnownParityTenants([{ ...native, native: { ...native.native!, ...change } }])).toThrow("Unexpected tenant");
  });
});
