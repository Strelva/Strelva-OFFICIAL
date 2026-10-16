import { recordedActorSchema, type RecordedActor } from "@/platform/workspaces/types";
export { recordedActorSchema, type RecordedActor } from "@/platform/workspaces/types";

export const ACTOR_NOT_RECORDED = "Actor not recorded";

/** A receipt always discloses whether its actor identity is available. */
export function actorLabel(actor: unknown): string {
  const { name, credit } = actorPresentation(actor);
  return name ? `${name}${credit ? ` · ${credit}` : ""}` : ACTOR_NOT_RECORDED;
}

export function recordedActor(value: unknown): RecordedActor | null {
  const parsed = recordedActorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function actorPresentation(actor: unknown): { name: string | null; credit: string | null } {
  const recorded = recordedActor(actor);
  if (!recorded) return { name: null, credit: null };
  switch (recorded.kind) {
    case "platform": return { name: "Strelva", credit: null };
    case "agency": return { name: recorded.personName ? `${firstName(recorded.personName)} at ${recorded.displayName}` : recorded.displayName, credit: "Runs on Strelva" };
    case "person": return { name: recorded.displayName, credit: null };
    case "operator": return { name: recorded.displayName ? `${recorded.displayName} (platform support)` : "Platform operator (support)", credit: null };
  }
}

/** "Maya" from "Maya Okafor": how a person is named beside their agency. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

/**
 * The shortest true name for whoever acted: the person when one is recorded
 * ("Maya"), else the agency or Strelva. For a byline beside a fuller sentence.
 */
export function actorShortName(actor: unknown): string | null {
  const recorded = recordedActor(actor);
  if (recorded?.kind === "agency" && recorded.personName) return firstName(recorded.personName);
  return actorPresentation(actor).name;
}

/** Action starts with a lower-case verb; supply a neutral form for non-verb phrases. */
export function actorSentence(actor: unknown, action: string, neutral?: string): string {
  const { name } = actorPresentation(actor);
  return name ? `${name} ${action}` : neutral ?? `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}

/** Adapt authored platform-placeholder copy once, never an already named actor. */
export function actorCopy(text: string, actor: unknown): string {
  const { name } = actorPresentation(actor);
  if (name && name !== "Strelva" && text.startsWith(`${name} `)) return text;
  // Authored actions start with a lower-case verb. "Strelva Agency …" is a
  // recorded name, even if the caller has no actor metadata.
  if (!/^Strelva [a-z]/.test(text)) return text;
  const action = text.slice("Strelva ".length);
  const neutral = action.startsWith("is ") ? `${action.slice(3, 4).toUpperCase()}${action.slice(4)}`
    : action.startsWith("needs ") ? `Needs ${action.slice(6)}` : undefined;
  return actorSentence(actor, action, neutral);
}
