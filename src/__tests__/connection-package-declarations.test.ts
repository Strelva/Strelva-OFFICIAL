import { describe, expect, it } from "vitest";
import {
  assertPackageDeclaration,
  automatedRevisionQualification,
  effectivePackageBehavior,
  packageDeclarationSchema,
  readPackageDeclaration,
  requiredConnectionsForBehavior,
} from "@/platform/system-versions/declaration";
import { packageCatalogSchema } from "@/platform/system-versions/listing-contracts";
import { createSupabaseVersionStore } from "@/platform/system-versions/supabase-store";
import type { SourceRevision } from "@/platform/system-versions/types";

const app = { kind: "internal_app", title: "Harbor Dental requests", fields: [], components: [] };
const inquiry = { kind: "inquiry_pattern", name: "Inquiries", title: "Get in touch", intro: "", fields: [{ id: "email", label: "Email", kind: "email", required: true }], routingWithinMinutes: 60 };
const website = { kind: "website_section", title: "Questions", items: [{ question: "When?", answer: "Contact our team." }] };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const revision: SourceRevision = {
  source: { businessId: workspaceId, systemId: sourceId, revisionId, number: 1 },
  definition: app, declaration: effectivePackageBehavior(app), requires: { bindingKinds: [] },
  summary: "Requests", publishedBy: workspaceId, publishedAt: "2026-10-14T00:00:00Z",
};
function legacyDeclaration() {
  const { requiredConnections: _requirements, ...legacy } = effectivePackageBehavior(app);
  return legacy;
}

describe("App connection declarations", () => {
  it("derives platform email from actual native runtime effects and retains legacy bindings", () => {
    expect(effectivePackageBehavior(inquiry).requiredConnections).toEqual([
      { provider: "resend", access: "act", optional: false, purpose: "Send System email to approved recipients" },
    ]);
    expect(effectivePackageBehavior(app).requiredConnections).toEqual(effectivePackageBehavior(inquiry).requiredConnections);
    expect(effectivePackageBehavior(inquiry).bindingKinds).toEqual(["email"]);
    expect(effectivePackageBehavior(website).requiredConnections).toEqual([]);
    expect(effectivePackageBehavior(website).bindingKinds).toEqual(["website"]);
    expect(requiredConnectionsForBehavior({ outsideEffects: ["google"] })).toEqual([
      { provider: "google_business_profile", access: "act", optional: false, purpose: "Apply approved Google Business Profile changes" },
    ]);
  });

  it("deduplicates object declarations in mixed bundles", () => {
    const result = effectivePackageBehavior({ kind: "bundle", systems: [
      { key: "app", name: "Requests", definition: app },
      { key: "inquiry", name: "Inquiries", definition: inquiry },
      { key: "faq", name: "FAQ", definition: website },
    ] });
    expect(result.requiredConnections).toEqual(effectivePackageBehavior(inquiry).requiredConnections);
    expect(result.outsideEffects).toEqual(["email", "publish"]);
  });

  it("qualifies exact connection requirements, refusing omission, read-only, optional and unused provider substitutions", () => {
    const declaration = effectivePackageBehavior(app);
    expect(() => assertPackageDeclaration(app, declaration)).not.toThrow();
    for (const requirements of [[], [{ ...declaration.requiredConnections[0]!, access: "read" as const }], [{ ...declaration.requiredConnections[0]!, optional: true }], [...declaration.requiredConnections, { provider: "highlevel" as const, access: "read" as const, optional: true, purpose: "Unsupported catalog claim" }]]) {
      const altered = { ...declaration, requiredConnections: requirements };
      expect(() => assertPackageDeclaration(app, altered)).toThrow("requiredConnections");
      const qualification = automatedRevisionQualification({ ...revision, declaration: altered });
      expect(qualification.evidence.find(check => check.check === "declaration_match")?.status).toBe("failed");
    }
    expect(packageDeclarationSchema.safeParse(legacyDeclaration()).success).toBe(false);
  });

  it("derives historical declarations without mutating stored input or trusting creator claims", () => {
    const legacy = legacyDeclaration();
    const before = JSON.stringify(legacy);
    expect(readPackageDeclaration(app, legacy).requiredConnections).toEqual(effectivePackageBehavior(app).requiredConnections);
    expect(JSON.stringify(legacy)).toBe(before);
    expect("requiredConnections" in legacy).toBe(false);
    expect(readPackageDeclaration(app, { ...legacy, requiredConnections: [] }).requiredConnections).toEqual([]);
    expect(() => readPackageDeclaration({ kind: "arbitrary", outsideEffects: ["google"] }, legacy)).toThrow();
    expect(() => effectivePackageBehavior({ kind: "booking", provider: "calendly" })).toThrow();
  });

  it("normalizes legacy published catalog rows only in memory", () => {
    const qualification = automatedRevisionQualification(revision);
    const listings = [{ name: "Requests", creatorName: "North Studio", source: {
      source: { businessId: workspaceId, systemId: sourceId }, listingState: "listed", creatorWorkspaceId: workspaceId,
    }, revision: { ...revision, declaration: legacyDeclaration(), qualification } }];
    const before = JSON.stringify(listings);
    const result = packageCatalogSchema.parse({ workspaceId, listings });
    expect(result.listings[0]!.revision.declaration.requiredConnections).toEqual(effectivePackageBehavior(app).requiredConnections);
    expect(JSON.stringify(listings)).toBe(before);
    expect(packageCatalogSchema.safeParse({ workspaceId, listings: [{ ...listings[0], revision: { ...listings[0]!.revision, definition: { kind: "unverified" } } }] }).success).toBe(false);
  });

  it("normalizes stored source revision reads without changing the database payload", async () => {
    const row = { ...revision, declaration: legacyDeclaration() };
    const before = JSON.stringify(row);
    const calls: string[] = [];
    const store = createSupabaseVersionStore({ rpc: async name => { calls.push(name); return { data: [row], error: null }; } });
    const actor = { userId: workspaceId, verifiedEmail: "maya@example.test", memberships: [{ businessId: workspaceId, role: "owner" as const }] };
    const result = await store.getRevision(actor, { businessId: workspaceId, systemId: sourceId }, 1);
    expect(result?.declaration?.requiredConnections).toEqual(effectivePackageBehavior(app).requiredConnections);
    expect(JSON.stringify(row)).toBe(before);
    expect(calls).toEqual(["read_system_version_source_revisions"]);
  });
});
