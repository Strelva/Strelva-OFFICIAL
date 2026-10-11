import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { PostgresBusinessEffortStore } from "@/platform/business-effort/repository";

/** Count canonical businesses through the existing audited operator read.
 * A billing group, site or missing backend must never manufacture a client. */
export async function readClientBusinessCount(): Promise<number | null> {
  if (!workspaceReleaseEnabled()) return null;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return null;
    const businesses = await PostgresBusinessEffortStore.listBusinesses(actor);
    return new Set(businesses.map(business => business.id)).size;
  } catch { return null; }
}
