import { decideAiContentGovernance } from "@/lib/ai-governance";
import { isContentSection } from "@/lib/types";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";

export type PublishGate =
  | { kind: "allowed"; reason: string }
  | { kind: "needs_approval"; reason: string }
  | { kind: "blocked"; reason: string };

const APPROVAL_REASON: Record<Exclude<DeclaredEffect["kind"], "publish">, string> = {
  calendar: "A calendar write is a Google write and needs a recorded approval.",
  message: "Sending a message cannot be undone and needs a recorded approval.",
  payment: "A payment change moves money and needs a recorded approval.",
};

/**
 * Publish effects are content changes, so they go through the one existing
 * governance path (src/lib/ai-governance.ts). Governance judges everything
 * that is sent: the declared publish data AND the provider request, so a
 * benign `publish.data` cannot carry a risky `request`. Calendar, message and
 * payment effects are outside writes and always need a recorded approval
 * (AGENTS.md: outside writes). "block" means the candidate must change.
 */
export function gatePublish(effect: DeclaredEffect): PublishGate {
  if (effect.kind !== "publish") return { kind: "needs_approval", reason: APPROVAL_REASON[effect.kind] };
  if (!effect.publish || !isContentSection(effect.publish.section)) {
    return { kind: "blocked", reason: "This publish effect names a section governance does not recognize." };
  }
  const judged = [decideAiContentGovernance(effect.publish.section, effect.publish.data), decideAiContentGovernance(effect.publish.section, effect.request)];
  const block = judged.find((d) => d.action === "block");
  if (block) return { kind: "blocked", reason: block.reason };
  const review = judged.find((d) => d.action === "review");
  if (review) return { kind: "needs_approval", reason: review.reason };
  return { kind: "allowed", reason: judged[0]!.reason };
}

export const gateEffect = gatePublish;
