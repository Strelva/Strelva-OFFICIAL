/** Application entry point for Needs you, with every live product port bound. */
import { googleMakeRealPorts } from "@/products/google-listing/server";
import { needsYouService as createService, type NeedsYouEffects } from "@/server/needs-you/server";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
export { needsYouAppOrigin, needsYouReleaseEnabled, needsYouStore, readStrelvaHandled } from "@/server/needs-you/server";
export function needsYouService(store?: NeedsYouStore, effects: NeedsYouEffects = {}) {
  return createService(store, { ...effects, google: googleMakeRealPorts });
}
