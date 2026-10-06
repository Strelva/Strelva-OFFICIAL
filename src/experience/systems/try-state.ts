import { verifyPossibilityPreviewToken } from "@/lib/possibility-preview-link";
import type { PossibilityTryState } from "./PossibilityTry";

/**
 * The state of a signed "Try it" link (systems-experience spec behavior 19).
 * `null`: Systems is off for that business, so the page does not exist. An
 * expired or tampered token says so; a candidate that changed (or closed)
 * says "This changed since we emailed you."
 */
export async function possibilityTryState(token: string, deps: {
  enabled(workspaceId: string): Promise<boolean>;
  read(claims: { businessId: string; possibilityId: string; candidateRevision: number }): Promise<{
    title: string; intent: string;
    changes: Array<{ candidate: { summary: string; content: Record<string, unknown> } }>;
    introduces: Array<{ name: string }>;
    effects: Array<{ channel?: string }>;
  } | null>;
}, now = Date.now()): Promise<PossibilityTryState | null> {
  const claims = verifyPossibilityPreviewToken(token, now);
  if (!claims) return { kind: "expired" };
  if (!(await deps.enabled(claims.workspaceId).catch(() => false))) return null;
  const p = await deps.read({ businessId: claims.workspaceId, possibilityId: claims.possibilityId, candidateRevision: claims.candidateRevision }).catch(() => null);
  if (!p) return { kind: "changed" };
  return {
    kind: "ready",
    view: {
      title: p.title,
      intent: p.intent,
      changes: p.changes.map((change) => change.candidate.summary.replace(/^the /, "The ")),
      introduces: p.introduces.map((intro) => intro.name),
      takesSubmissions: p.introduces.length > 0
        || p.effects.some((effect) => effect.channel === "inquiry_form" || effect.channel === "booking_page")
        || p.changes.some((change) => "form" in change.candidate.content),
    },
  };
}
