"use client";
// Disposable local route only; this file is never imported by a deployed route.
import { OfferingInstallationView } from "@/experience/workspace/OfferingInstallation";
import { listOfferingDefinitions, resolveOfferingSurfaces } from "@/platform/offerings/definitions";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";

const businessId = "11111111-1111-4111-8111-111111111111";
const resources = [{ kind: "inquiry_workspace" as const, id: "96000000-0000-4000-8000-000000000030" }];
const installation: OfferingInstallation = {
  id: "33333333-3333-4333-8333-333333333333", businessId,
  definitionId: "customer_inquiry_intake", definitionVersion: "1.0.0",
  status: "active", revision: 1, configuration: {}, nativeResources: resources,
  responsibility: { kind: "customer_operated", providerName: "Fictional Harbor" },
  acceptedScope: ["handle_inquiries"],
  surfaces: resolveOfferingSurfaces("customer_inquiry_intake", "1.0.0", resources, ["inquiry_workspace"], businessId, "active"),
  installedBy: "fictional-owner", installedAt: "2026-10-09T12:00:00.000Z",
  updatedBy: "fictional-owner", updatedAt: "2026-10-09T12:00:00.000Z",
};
const collection: OfferingCollection = {
  businessId, permissions: { canRead: true, canManage: true, role: "owner" },
  definitions: listOfferingDefinitions(), installations: [installation], websiteBindings: [],
};

export default function InquiryProof() {
  return <main className="mx-auto max-w-4xl p-4 sm:p-8">
    <p role="note">Disposable fictional inquiry installation. No Auth, provider or production actions.</p>
    <OfferingInstallationView collection={collection} installation={installation} work={[]} saving={false}
      onBack={() => undefined} onOpenWork={() => undefined} onCommand={async () => null} />
  </main>;
}
