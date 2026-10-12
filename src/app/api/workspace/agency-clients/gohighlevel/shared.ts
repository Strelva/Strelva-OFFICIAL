import type { WorkspaceActor } from "@/platform/workspaces/types";
import { assertGhlAgencyManager, defaultGhlServiceDeps } from "@/products/agency-clients/server";

export function assertGhlAgencyManagerForRoute(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  return assertGhlAgencyManager(actor, workspaceId, defaultGhlServiceDeps());
}

export function agencyClientsRedirect(appUrl: string, workspaceId: string | undefined, outcome: { connected: true } | { error: string }): URL {
  const target = new URL(`${appUrl.replace(/\/$/, "")}/workspace`);
  target.searchParams.set("view", "clients");
  if (workspaceId) target.searchParams.set("workspaceId", workspaceId);
  if ("error" in outcome) target.searchParams.set("highlevelError", outcome.error);
  else target.searchParams.set("highlevel", "connected");
  return target;
}
