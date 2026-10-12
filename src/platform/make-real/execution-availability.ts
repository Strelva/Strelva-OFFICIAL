import type { MakeRealChannel } from "@/platform/possibilities/contracts";

export type ExecutionAvailability = "live" | "rehearsal" | "unavailable";

/** Every effect in this exact plan must be released; another plan's live channel grants nothing. */
export async function livePlanChannelsAvailable(channels: readonly (MakeRealChannel | undefined)[], enabled: (channel: MakeRealChannel) => Promise<boolean>): Promise<boolean> {
  if (!channels.length || channels.some(channel => !channel)) return false;
  return (await Promise.all([...new Set(channels)].map(channel => channel ? enabled(channel).catch(() => false) : Promise.resolve(false)))).every(Boolean);
}

export function executionAvailability(stored: boolean, sourceRef: string | null, live: boolean): ExecutionAvailability {
  if (!stored) return "rehearsal";
  if (live) return "live";
  return sourceRef?.startsWith("website-rebuild:") ? "rehearsal" : "unavailable";
}
