/**
 * The app edge: plugs the workspace layers into the ports the tenant model
 * declares (src/lib/workspace-ports.ts), once per runtime. Imported for its
 * effect by instrumentation.ts (the Next.js server), vitest.setup.ts and the
 * scripts that reach those modules. Strelva Reborn section 7.
 */
import { registerWorkspacePorts, type WorkspacePorts } from "@/lib/workspace-ports";
import { workspacePortLoaders } from "@/server/workspace-ports";
import { registerTenantPublishingPorts } from "@/platform/infra/tenant-publishing";

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
  recordGoogleConnection: async (...args) => (await import("@/lib/google-access")).recordGoogleConnection(...args),
}));
