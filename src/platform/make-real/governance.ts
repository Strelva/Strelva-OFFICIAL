import { decideAiContentGovernance } from "@/lib/ai-governance";
import { isContentSection } from "@/lib/types";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";

export type PublishGate =
  | { kind: "allowed"; reason: string }
  | { kind: "needs_approval"; reason: string }
  | { kind: "blocked"; reason: string };

/**
 * Publish effects are content changes, so they go through the one existing
 * governance path (src/lib/ai-governance.ts). Make real does not create a
 * second rule set: "review" means a recorded human approval for this exact
 * effect is required, "block" means the candidate must change.
 */
export function gatePublish(effect: DeclaredEffect): PublishGate {
  if (effect.kind !== "publish") return { kind: "allowed", reason: "Not a content change." };
  if (!effect.publish || !isContentSection(effect.publish.section)) {
    return { kind: "blocked", reason: "This publish effect names a section governance does not recognize." };
  }
  const decision = decideAiContentGovernance(effect.publish.section, effect.publish.data);
  if (decision.action === "block") return { kind: "blocked", reason: decision.reason };
  if (decision.action === "review") return { kind: "needs_approval", reason: decision.reason };
  return { kind: "allowed", reason: decision.reason };
}
