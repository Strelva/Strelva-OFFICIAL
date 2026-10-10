import type { UnifiedEvent } from "@/platform/infra/event-contract";
import { executePublishingEvent as executeContentEvent } from "./content-service";
import { executeGoogleListingEvent } from "@/products/google-listing/server";

/** One port into the existing claimed event executor; each output keeps its
 * source resolver and its own receipt home. */
export async function executePublishingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string; attemptId: string }) {
  const content = await executeContentEvent(input);
  if (content) return content;
  if (input.event.metadata?.kind !== "workspace_google_listing_draft") return null;
  return executeGoogleListingEvent(input);
}
