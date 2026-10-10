import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { releaseFlagEnvMode } from "@/platform/release-flags/resolve";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { comparePossibility } from "@/platform/possibilities";
import { createSupabasePossibilityRepository, isStoredPossibilityId } from "@/platform/possibilities/supabase-repository";
import { createSupabaseRevisionContent } from "@/platform/make-real/supabase-content";
import { createSystemStoreLiveSystems } from "@/platform/make-real/systems-adapter";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";

export const dynamic = "force-dynamic";

const query = z.object({ workspaceId: z.string().uuid(), possibilityId: z.string().uuid() }).strict();

/**
 * One stored Possibility and its compare against what is live now
 * (systems-experience spec section 5, routes). Any member reads; an agency
 * reads only Possibilities whose every System is in its scope (the RPC
 * enforces it). Read only: nothing here changes a Possibility or a System.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  if (releaseFlagEnvMode("systems") === "off") return workspaceJson({ error: "Possibilities are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const url = new URL(request.url);
    const parsed = query.safeParse({ workspaceId: url.searchParams.get("workspaceId"), possibilityId: url.searchParams.get("possibilityId") });
    if (!parsed.success || !isStoredPossibilityId(parsed.data.possibilityId)) return workspaceJson({ error: "Check the request." }, 400);
    const { workspaceId, possibilityId } = parsed.data;
    const workspace = (await listWorkspaces(actor)).find((item) => item.id === workspaceId);
    if (!workspace || workspace.kind !== "customer") return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (!(await systemsReleaseEnabledForWorkspace(workspace.id, { operator: false, tester: false, userId: actor.userId }))) return workspaceJson({ error: "Possibilities are not enabled." }, 503);
    const p = await createSupabasePossibilityRepository(actor).get(workspaceId, possibilityId);
    if (!p) return workspaceJson({ error: "This possibility is not available." }, 404);
    const live = createSystemStoreLiveSystems({ store: createSupabaseSystemStore(), content: createSupabaseRevisionContent(actor), actor });
    const compare = await comparePossibility(p, live).catch(() => null);
    const stale = [...p.history].reverse().find((h) => h.kind === "stale");
    return workspaceJson({
      possibility: {
        id: p.id, title: p.title, intent: p.intent, status: p.status, candidateRevision: p.candidateRevision,
        changes: p.changes.map((c) => ({ systemId: c.baseline.systemId, summary: c.candidate.summary })),
        introduces: p.introduces.map((i) => ({ key: i.key, name: i.name })),
        effects: p.effects.map((e) => ({ id: e.id, description: e.description, channel: e.channel ?? null })),
        checks: p.checks,
        staleReason: p.status === "exploring" && stale ? stale.detail ?? null : null,
        updatedAt: p.updatedAt,
      },
      // Null: the live side could not be read now; no difference is claimed.
      compare,
    });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
