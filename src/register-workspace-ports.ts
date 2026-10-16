/**
 * The app edge: plugs the workspace layers into the ports the tenant model
 * declares (src/lib/workspace-ports.ts), once per runtime. Imported for its
 * effect by instrumentation.ts (the Next.js server), vitest.setup.ts and the
 * scripts that reach those modules. Strelva Reborn section 7.
 */
import { registerWorkspacePorts, type WorkspacePorts } from "@/lib/workspace-ports";
import { workspacePortLoaders } from "@/server/workspace-ports";
import { registerTenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import { registerListingsTenantPorts } from "@/platform/listings-sync/runtime-ports";

import { registerCalendarBusyProviderRead, registerBookingRequestNotifier } from "@/platform/bookings/runtime-ports";
import { registerAutoPostWithdrawal } from "@/platform/ai-controls/runtime-ports";
import { registerVisitorMailBrandReader } from "@/platform/infra/email/visitor-brand-port";

const ports: WorkspacePorts = workspacePortLoaders;
registerWorkspacePorts(ports);

registerTenantPublishingPorts(async () => ({
  reviewPreparation: {
    mode: async tenant => (await (await import("@/lib/reviews/reply-voice")).getReplyVoice(tenant)).mode,
    declined: async (tenant,review) => (await import("@/lib/review-replies")).isReviewReplyDeclined(tenant,review,true),
    draft: async (...args) => (await import("@/lib/review-replies")).draftReviewReply(...args),
  },
  markExecutionExternalAccepted: async (...args) => (await import("@/lib/events")).markExecutionExternalAccepted(...args),
  markExecutionExternalUnconfirmed: async (...args) => (await import("@/lib/events")).markExecutionExternalUnconfirmed(...args),
  addEvent: async (...args) => (await import("@/lib/events")).addEvent(...args),
  getEventRaw: async (...args) => (await import("@/lib/events")).getEventRaw(...args),
  getEvents: async (...args) => (await import("@/lib/events")).getEvents(...args),
  getEventsRaw: async (...args) => (await import("@/lib/events")).getEventsRaw(...args),
  getEntry: async (...args) => (await import("@/lib/cms/collections-service")).getEntry(...args),
  listEntriesForType: async (...args) => (await import("@/lib/cms/collections-service")).listEntriesForType(...args),
  resolveEventAction: async (...args) => (await import("@/lib/event-actions")).resolveEventAction(...args),
  mirrorPublishedReviewReply: async (...args) => (await import("@/lib/reviews")).mirrorPublishedReviewReply(...args),
  beginGoogleReconnectOperation: async (...args) => (await import("@/lib/google-access")).beginGoogleReconnectOperation(...args),
  recordGoogleConnection: async (...args) => (await import("@/lib/google-access")).recordGoogleConnection(...args),
}));

// Product/provider callbacks stay at the app edge; platform booking rules own no product implementation.
registerCalendarBusyProviderRead(async (...args) => (await import("@/products/scheduling/server")).readWorkspaceProviderAvailability(...args));
registerBookingRequestNotifier(async (booking) => (await import("@/server/needs-you/server")).notifyBookingRequestNow(booking));
// A usage-controls hold withdraws reply timers already waiting; the tenant review code stays in src/lib.
registerAutoPostWithdrawal(async (...args) => (await import("@/lib/reviews/auto-reply")).withdrawPendingAutoPosts(...args));

// Listings in sync reads tenant addresses and the Yelp key through two small ports; the tenant model stays in src/lib.
registerListingsTenantPorts(async () => ({
  tenant: async tenantId => {
    const config = await (await import("@/lib/tenants")).getTenantConfig(tenantId);
    if (!config) return null;
    return { id: config.id, deliveryModel: config.deliveryModel, customRepo: config.customRepo, publicUrl: (await import("@/lib/tenant-urls")).getTenantPublicUrl(config) };
  },
  yelpConnection: async tenantId => (await import("@/lib/connections")).getConnection(tenantId, "yelp"),
}));

// Visitor mail wears the business's own look; which look that is belongs to the websites product.
registerVisitorMailBrandReader(async ({ tenantId, workspaceId }) => {
  const [{ readVisitorBrand, readVisitorBrandForWorkspace }, { visitorBrandForMail }] = await Promise.all([import("@/products/websites"), import("@/products/websites/client")]);
  const tenant = tenantId && !tenantId.startsWith("workspace:") ? tenantId : null;
  const workspace = workspaceId ?? (tenantId?.startsWith("workspace:") ? tenantId.slice("workspace:".length) : null);
  return visitorBrandForMail(tenant ? await readVisitorBrand(tenant) : await readVisitorBrandForWorkspace(workspace));
});
