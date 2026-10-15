import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubAllProviderKeys } from "./helpers/provider-keys";
import { createSupabaseConnectionOwnership, type VersionsDb } from "@/platform/system-versions/supabase-store";
const business = "b1000000-0000-4000-8000-000000000001";
const agency = "b1000000-0000-4000-8000-000000000002";
const actor = { userId: "b1000000-0000-4000-8000-000000000003", verifiedEmail: "owner@example.test", memberships: [{ businessId: business, role: "owner" as const }] };
const db: VersionsDb = { rpc: async () => ({ data: business, error: null }) };
const ref = "google_business_profile:location1";
beforeEach(() => stubAllProviderKeys());
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

it("bindAccount preserves source/sibling isolation and admits an agency-held ref only while eligible", async () => {
  const { createInMemoryVersionStore } = await import("@/platform/system-versions/store");
  const { createSystemVersions } = await import("@/platform/system-versions/service");
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", `agency:${agency}`);
  vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
  let granted = true;
  const sourceBusiness = "b1000000-0000-4000-8000-000000000005";
  const sibling = "b1000000-0000-4000-8000-000000000006";
  const combined: VersionsDb = { rpc: async (name, args) => ({ data: name === "read_system_version_connection_owner"
    ? args.p_connection_ref === "google_business_profile:source" ? sourceBusiness : args.p_connection_ref === "google_business_profile:sibling" ? sibling : business
    : name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: agency }
      : name === "connection_agency_holds_area" ? granted
        : [{ ref: args.p_workspace_id === business ? ref : `google_business_profile:${args.p_workspace_id === sibling ? "sibling" : "source"}`, accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency } }], error: null }) };
  const store = createInMemoryVersionStore();
  const versions = createSystemVersions({ store, connections: createSupabaseConnectionOwnership(combined) });
  const owner = { ...actor, memberships: [...actor.memberships, { businessId: sourceBusiness, role: "owner" as const }] };
  const source = { businessId: sourceBusiness, systemId: crypto.randomUUID() };
  const revision = await versions.publishSourceRevision(owner, { source, definition: { kind: "website_section", title: "Questions", items: [{ question: "Hours?", answer: "Ask our team." }] }, summary: "Fictional section" });
  await versions.shareSource(owner, source, business);
  const draft = await versions.createVersion(owner, { source: revision.source, version: { businessId: business, systemId: crypto.randomUUID() }, context: { kind: "agency_client", label: "Harbor Dental" } });
  for (const connectionId of ["google_business_profile:source", "google_business_profile:sibling"]) {
    await expect(versions.bindAccount(owner, draft.id, { kind: "google", connectionId, expectedRowRevision: 1 })).rejects.toThrow(/another business/);
  }
  granted = false;
  await expect(versions.bindAccount(owner, draft.id, { kind: "google", connectionId: ref, expectedRowRevision: 1 })).rejects.toThrow(/another business/);
  expect((await store.getLineage(owner, draft.id))?.bindings).toEqual([]);
  granted = true;
  expect((await versions.bindAccount(owner, draft.id, { kind: "google", connectionId: ref, expectedRowRevision: 1 })).bindings).toEqual([expect.objectContaining({ connectionId: ref, ownerBusinessId: business })]);
});
