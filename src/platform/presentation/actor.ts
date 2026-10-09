import { z } from "zod";

/** Presentation of the actor recorded for this action, never the current agency seat. */
export const recordedActorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({ kind: z.literal("agency"), displayName: z.string().trim().min(1) }),
  z.object({ kind: z.literal("person"), displayName: z.string().trim().min(1) }),
  z.object({ kind: z.literal("operator"), displayName: z.string().trim().min(1).optional() }),
]);
export type RecordedActor = z.infer<typeof recordedActorSchema>;

export function recordedActor(value: unknown): RecordedActor | null {
  const parsed = recordedActorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function actorPresentation(actor: unknown): { name: string | null; credit: string | null } {
  const recorded = recordedActor(actor);
  if (!recorded) return { name: null, credit: null };
  switch (recorded.kind) {
    case "platform": return { name: "Strelva", credit: null };
    case "agency": return { name: recorded.displayName, credit: "Runs on Strelva" };
    case "person": return { name: recorded.displayName, credit: null };
    case "operator": return { name: recorded.displayName ? `${recorded.displayName} (platform support)` : "Platform operator (support)", credit: null };
  }
}

/** Action starts with a lower-case verb; supply a neutral form for non-verb phrases. */
export function actorSentence(actor: unknown, action: string, neutral?: string): string {
  const { name } = actorPresentation(actor);
  return name ? `${name} ${action}` : neutral ?? `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}

/** Only authored actor copy is adapted. Never replace Strelva inside quoted customer words. */
export function actorCopy(text: string, actor: unknown): string {
  if (!text.startsWith("Strelva ")) return text;
  const action = text.slice("Strelva ".length);
  const neutral = action.startsWith("is ") ? `${action.slice(3, 4).toUpperCase()}${action.slice(4)}`
    : action.startsWith("needs ") ? `Needs ${action.slice(6)}` : undefined;
  return actorSentence(actor, action, neutral);
}
