import { XaSays } from "@/components/ui/strelva/Xa";
import type { OwnerRetentionSignals } from "@/lib/retention";

/**
 * Strelva's one suggestion for this week, said by Pebble as a sentence. The
 * week's numbers are said once elsewhere on Today; nothing here is a stat row.
 * Renders nothing when there is no suggestion.
 */
export function RetentionPanel({ signals }: { signals: OwnerRetentionSignals }) {
  if (!signals.ownerNextAction) return null;
  return <XaSays>{signals.ownerNextAction}</XaSays>;
}
