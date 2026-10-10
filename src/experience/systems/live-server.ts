/** Application composition: product-owned Google operations satisfy the platform port. */
import { googleMakeRealPorts } from "@/products/google-listing/server";
import { createServerLiveMakeReal, startLiveMakeReal as start } from "@/server/make-real/live-server";
export { activationStarter, activationRunner, listDueActivations, anyMakeRealChannelEnabled } from "@/server/make-real/live-server";
export const liveMakeReal = createServerLiveMakeReal(googleMakeRealPorts);
export function startLiveMakeReal(input: Parameters<typeof start>[1]) { return start(googleMakeRealPorts, input); }
export { googleMakeRealPorts };
