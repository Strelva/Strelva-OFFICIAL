import { afterEach, expect, it, vi } from "vitest";
import { createSupabaseConnectionOwnership, type VersionsDb } from "@/platform/system-versions/supabase-store";
const business = "b1000000-0000-4000-8000-000000000001";
const agency = "b1000000-0000-4000-8000-000000000002";
const actor = { userId: "b1000000-0000-4000-8000-000000000003", verifiedEmail: "owner@example.test", memberships: [{ businessId: business, role: "owner" as const }] };
const db: VersionsDb = { rpc: async () => ({ data: business, error: null }) };
const ref = "google_business_profile:location1";
afterEach(() => { vi.unstubAllEnvs(); });
it("preserves legacy calendar/tenant ownership without widening their owner", async () => {
  const ownership = createSupabaseConnectionOwnership(db);
  expect(await ownership.ownerOf(actor, "calendar:existing")).toBe(business);
  expect(await createSupabaseConnectionOwnership({ rpc: async () => ({ data: null, error: null }) }).ownerOf(actor, "tenant:foreign")).toBeNull();
});
it("refuses a new provider ref while its deployment access is unavailable", async () => {
  const combined: VersionsDb = { rpc: async name => ({ data: name === "read_system_version_connection_owner" ? business : { actingAgencyWorkspaceId: null }, error: null }) };
  expect(await createSupabaseConnectionOwnership(combined).ownerOf(actor, ref)).toBeNull();
});
it("requires recorded account holders and matching current access", async () => {
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", "platform");
  vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
  let through: object = { kind: "platform" };
  let records = true;
  const combined: VersionsDb = { rpc: async name => ({ data: name === "read_system_version_connection_owner" ? business : name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: null } : records ? [{ ref, accountHolder: { kind: "business", workspaceId: business }, accessThrough: through }] : [], error: null }) };
  const ownership = createSupabaseConnectionOwnership(combined);
  expect(await ownership.ownerOf(actor, ref)).toBe(business);
  through = { kind: "agency", workspaceId: agency };
  expect(await ownership.ownerOf(actor, ref)).toBeNull();
  records = false;
  expect(await ownership.ownerOf(actor, ref)).toBeNull();
});
it("allows the assigned agency's access only with its current area", async () => {
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", `agency:${agency}`);
  vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
  let granted = true;
  const combined: VersionsDb = { rpc: async name => ({ data: name === "read_system_version_connection_owner" ? business : name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: agency } : name === "connection_agency_holds_area" ? granted : [{ ref, accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency } }], error: null }) };
  const ownership = createSupabaseConnectionOwnership(combined);
  expect(await ownership.ownerOf(actor, ref)).toBe(business);
  granted = false;
  expect(await ownership.ownerOf(actor, ref)).toBeNull();
});
