/**
 * Real ports for the workspace-lifecycle adapters in this folder. Each port
 * calls the lifecycle's existing service or RPC wrapper (the same functions
 * its own API route calls), so Needs you adds no second write path. Heavy
 * product modules load lazily so Home's read stays light.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import type { SourceAdapter } from "../adapters";
import { agencyGrantAdapter, type PendingAgencyGrant } from "./agency-grant";
import { providerDeliveryAdapter } from "./provider-delivery";
import { standingResponsibilityAdapter } from "./standing-responsibility";
import { websiteDocumentAdapter } from "./website-document";
import { workResponsibilityAdapter } from "./work-responsibility";

async function offeringServices() {
  const offerings = await import("@/platform/offerings");
  const operations = await import("@/products/operations/server");
  const installations = new offerings.OfferingService(new offerings.PostgresOfferingStore());
  const deliveries = new offerings.ProviderDeliveryService(offerings.postgresProviderDeliveries, {
    read: (actor, businessId, installationId) => installations.read(actor, businessId, installationId),
    async canManage(actor, businessId) { return (await installations.list(actor, businessId)).permissions.canManage; },
  }, {
    inspect: operations.inspectOperationalAssignment,
    accept: operations.acceptOperationalAssignment,
    revoke: operations.revokeOperationalAssignment,
  });
  return { offerings, operations, installations, deliveries };
}

async function websites() {
  const release = await import("@/products/websites/rebuild-release");
  if (!release.websiteRebuildReleaseEnabled()) return null;
  return import("@/products/websites/rebuild-service");
}

function activeGrant(grant: { status: string; expiresAt: string } | null, now = Date.now()): boolean {
  return Boolean(grant && grant.status === "active" && Date.parse(grant.expiresAt) > now);
}

/** Agency deliveries waiting on the owner's draft grant; the same conditions the delivery screen shows the grant button under. */
async function pendingAgencyGrants(actor: WorkspaceActor, workspaceId: string): Promise<PendingAgencyGrant[]> {
  const { offerings, operations, installations, deliveries } = await offeringServices();
  const pending: PendingAgencyGrant[] = [];
  for (const delivery of await deliveries.list(actor, workspaceId)) {
    if (delivery.status !== "accepted" || delivery.businessId !== workspaceId) continue;
    const installation = await installations.read(actor, workspaceId, delivery.installationId);
    const responsibility = installation.responsibility;
    if (responsibility.kind !== "provider_requested" || responsibility.providerKind !== "agency") continue;
    const resource = installation.nativeResources.length === 1 ? installation.nativeResources[0]! : null;
    if (!resource || (resource.kind !== "application" && resource.kind !== "managed_website")) continue;
    const assigned = await operations.inspectOperationalAssignment(actor, delivery.assignmentId);
    if (assigned.assignment.status !== "accepted") continue;
    if (resource.kind === "application") {
      if (activeGrant(await offerings.postgresAgencyApplicationDraftAccess.read(actor, resource.id))) continue;
    } else if (activeGrant(await (await import("@/platform/offerings/agency-website-draft")).postgresAgencyManagedWebsiteDraftAccess.read(actor, resource.id))) continue;
    pending.push({
      target: resource.kind === "application" ? "application" : "website",
      workspaceId,
      deliveryId: delivery.id,
      deliveryRevision: delivery.revision,
      targetId: resource.id,
      providerName: responsibility.providerName,
      label: resource.kind === "application" ? "your application" : "your website",
    });
  }
  return pending;
}

/** Adapters for website documents, provider delivery, Running, finite work and agency grants. */
export function deliverySourceAdapters(): SourceAdapter[] {
  return [
    websiteDocumentAdapter({
      async list(actor, workspaceId) {
        const service = await websites();
        return service ? service.listWebsiteRebuilds(actor, workspaceId) : [];
      },
      async approve(actor, workId, selection) {
        const service = await websites();
        if (!service) throw new WorkspaceConflictError("Website rebuilds are not enabled.");
        return service.approveWebsiteRebuild(actor, workId, selection);
      },
      async launch(actor, workId, selection) {
        const service = await websites();
        if (!service) throw new WorkspaceConflictError("Website rebuilds are not enabled.");
        return service.launchWebsiteRebuild(actor, workId, selection);
      },
    }),
    providerDeliveryAdapter({
      list: async (actor, businessId) => (await offeringServices()).deliveries.list(actor, businessId),
      async workCompleted(actor, delivery) {
        const { operations } = await offeringServices();
        const assigned = await operations.inspectOperationalAssignment(actor, delivery.assignmentId).catch(() => null);
        return assigned?.responsibility.payload.status === "completed";
      },
      confirm: async (actor, input) => (await offeringServices()).deliveries.execute(actor, { action: "decide", deliveryId: input.deliveryId, expectedRevision: input.expectedRevision, decision: "confirmed", note: input.note }),
    }),
    standingResponsibilityAdapter({
      list: async (actor, workspaceId) => (await import("@/platform/work-execution/standing-repository")).listStandingResponsibilities(actor, workspaceId),
      approve: async (actor, standingId, expectedRevision) => (await import("@/products/operations/responsibilities")).commandStandingResponsibility(actor, standingId, { kind: "approve", expectedRevision }),
    }),
    workResponsibilityAdapter({
      async list(actor, workspaceId) {
        const [{ listWork }, { responsibilitySchema }] = await Promise.all([import("@/platform/workspaces/repository"), import("@/platform/work-execution/engine")]);
        return (await listWork(actor, workspaceId)).flatMap(work => {
          if (work.productId !== "operations" || work.resourceKind !== "responsibility") return [];
          const payload = responsibilitySchema.safeParse(work.payload);
          return payload.success ? [{ id: work.id, workspaceId: work.workspaceId, payload: payload.data }] : [];
        });
      },
      async approve(actor, workId, expectedRevision) {
        const { workspaceResponsibilityCommands } = await import("@/products/operations/responsibilities");
        const saved = await workspaceResponsibilityCommands.command(actor, workId, { kind: "approve", expectedRevision });
        return { id: saved.id, workspaceId: saved.workspaceId, payload: saved.payload };
      },
    }),
    agencyGrantAdapter({
      pending: pendingAgencyGrants,
      async grant(actor, input) {
        if (input.target === "application") return (await import("@/platform/offerings")).createAgencyApplicationDraftAccessService().grant(actor, input.deliveryId, input.targetId);
        return (await import("@/platform/offerings/agency-website-draft")).createAgencyManagedWebsiteDraftAccessService().grant(actor, input.deliveryId, input.targetId);
      },
    }),
  ];
}
