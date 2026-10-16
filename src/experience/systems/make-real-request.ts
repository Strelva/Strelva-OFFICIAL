import { z } from "zod";
import type { MakeRealOutcome } from "./model";

/**
 * The live yes on Systems up close (S4, S5) and in the Possibilities list:
 * one word for one gesture. GLOSSARY.md names the live-approval button
 * "Make it live"; the XA foundation default ("Put it live") awaits Jacob's call.
 */
export const LIVE_YES = "Make it live";

/** Who may say yes, in one sentence. Names the owner when known. */
export function ownerOnlyReason(ownerName?: string): string {
  return ownerName ? `Only ${ownerName} can say yes to this.` : "Only the owner of this business can say yes to this.";
}

/** One POST /api/workspace/systems/make-real, read strictly. Shared by the System page's Possibilities and the Possibility view (XA · S5). */
const makeRealResponseSchema = z.union([
  z.object({ live: z.object({ live: z.literal(true), status: z.string(), headline: z.string(), activationId: z.string().nullable() }) }),
  z.object({ result: z.object({ isolated: z.literal(true), status: z.enum(["in_progress", "needs_attention", "made_real", "rolled_back"]), headline: z.string(),
    done: z.array(z.object({ label: z.string(), mode: z.string().nullable() })), waiting: z.array(z.object({ label: z.string(), reason: z.string() })),
    unknown: z.array(z.string()), notStarted: z.array(z.string()), liveUnchanged: z.boolean(), notConnected: z.array(z.string()) }) }),
]);

export async function requestMakeReal(request: typeof fetch, workspaceId: string, possibilityId: string, executionMode: "live" | "rehearsal"): Promise<MakeRealOutcome> {
  try {
    const response = await request("/api/workspace/systems/make-real", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, possibilityId, executionMode }),
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = makeRealResponseSchema.safeParse(body);
    if (response.ok && parsed.success) {
      if ("live" in parsed.data) return { kind: "live", headline: parsed.data.live.headline, started: Boolean(parsed.data.live.activationId) };
      return { kind: "result", result: parsed.data.result };
    }
    const error = z.object({ error: z.string() }).safeParse(body);
    if (response.status === 403) return { kind: "permission", message: error.success ? error.data.error : ownerOnlyReason() };
    return { kind: "error", message: `${error.success ? error.data.error : "Making this change live could not be confirmed."} Reload this System to check what landed before trying another change.` };
  } catch {
    return { kind: "error", message: "The response to making this change live was lost. It may have started. Reload this System to check what landed before trying another change." };
  }
}
