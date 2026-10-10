import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import {
  BusinessEffortAccessError, PostgresBusinessEffortStore, readBusinessEffortOverview,
  type BusinessEffortOverview,
} from "@/platform/business-effort";

export type BusinessEffortLoad =
  | { state: "disabled" }
  | { state: "denied" }
  | { state: "unavailable" }
  | { state: "ready"; overview: BusinessEffortOverview; today: string };

/** Read the human-minute ledger for the operator console. Customer businesses
 *  are workspace records, so the ledger follows the workspace release gate. */
export async function loadBusinessEffort(now: Date = new Date()): Promise<BusinessEffortLoad> {
  if (!workspaceReleaseEnabled()) return { state: "disabled" };
  try {
    const actor = await workspaceHttpActor();
    const overview = await readBusinessEffortOverview(PostgresBusinessEffortStore, actor, now);
    return { state: "ready", overview, today: now.toISOString().slice(0, 10) };
  } catch (error) {
    if (error instanceof BusinessEffortAccessError) return { state: "denied" };
    return { state: "unavailable" };
  }
}
