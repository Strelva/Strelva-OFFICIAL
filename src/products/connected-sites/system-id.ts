import { systemOriginId } from "@/platform/systems/invariants";
import type { ConnectedSite } from "./contracts";

/** The website System a connected site is: connected_site:<id>, the same id the projection derives. */
export function connectedSiteSystemId(site: Pick<ConnectedSite, "id" | "workspaceId">): string {
  return systemOriginId(site.workspaceId, { kind: "connected_site", ref: site.id });
}
