/**
 * The composition root for App event handlers. The app edge owns product
 * composition, so this is the one place that imports product code on behalf of
 * the Events platform (src/platform/app-events imports no product).
 *
 * To handle an Event:
 *   1. Declare `eventSubscriptions` on the App's Release in
 *      src/platform/app-releases/catalog.ts (see its README, "Events").
 *   2. Add one lazy wrapper below, with stable identity, in the style of
 *      src/server/connections/sources.ts:
 *        { appId: "bookings", handler: "stop_follow_ups",
 *          run: async (event, context) => (await import("@/products/…/server")).handleX(event, context) },
 *   3. Make the handler idempotent on event.id: delivery is at least once.
 * A test fails the build if a Release declares a subscription with no handler here.
 * Nothing is registered today: the six 1.0 Apps declare no subscription.
 */
import { registerAppEventHandler, type AppEventHandler } from "@/platform/app-events/handlers";
import type { BuiltInAppId } from "@/platform/app-releases/contracts";

interface ProductAppEventHandler { appId: BuiltInAppId; handler: string; run: AppEventHandler }

const productHandlers: readonly ProductAppEventHandler[] = [];

/** Called before the cron delivers. Repeated calls change nothing. */
export function registerProductAppEventHandlers(): void {
  for (const item of productHandlers) registerAppEventHandler(item.appId, item.handler, item.run);
}
