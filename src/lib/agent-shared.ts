import { z } from "zod";
import type { TenantConfig, SiteCapabilityManifest } from "./types";

/**
 * Shared AI-agent gates. The agent runs through two entry points — the streaming chat
 * route (`src/app/api/agent/route.ts`) and the background executor
 * (`src/lib/agent-executor.ts`, invoked when an owner approves a suggestion in
 * `event-actions.ts`). These gates MUST behave identically across both paths, so they
 * live here once instead of being copied. They had drifted: the executor was skipping
 * BOTH the manifest gate and the GBP gate.
 */

/**
 * Whether the agent may draft Google Business writes for this tenant: the business must
 * be local/hybrid, have a connected Google account, and that connection must carry the
 * GBP write scope. Lifted verbatim from the streaming route so both paths gate the same
 * way. (The lib write functions still re-check scope at approval time — belt-and-suspenders.)
 */
export async function resolveGbpWriteAllowed(
  tenant: string,
  tenantConfig: TenantConfig | null | undefined,
): Promise<boolean> {
  const { getPresenceProfile } = await import("./dashboard-surfaces");
  const { getContent } = await import("./storage");
  const settings = (await getContent("settings", tenant).catch(() => null)) as
    | { businessModel?: string }
    | null;
  const presence = getPresenceProfile({
    template: tenantConfig?.template ?? "",
    businessModel: settings?.businessModel,
  });
  if (presence === "online") return false;
  const { getConnections } = await import("./connections");
  const connections = await getConnections(tenant);
  const google = Array.isArray(connections)
    ? connections.find((c) => c.provider === "google" && c.status === "connected")
    : undefined;
  if (!google) return false;
  const { connectionHasWriteScope } = await import("./gbp-replies");
  return connectionHasWriteScope(google.scopes);
}

/**
 * The sections the agent may edit for this site, plus the matching Zod enum for tool
 * inputs — filtered by the site capability manifest (a section is editable unless the
 * manifest explicitly disallows "draft"), falling back to the full template list when the
 * filter would leave nothing. Lifted from the streaming route so both paths constrain the
 * agent to the same sections. (The manifest is also passed into `applySectionUpdate` to
 * gate publish; this enum just keeps the model from targeting a forbidden section.)
 */
export function resolveEditableSections(
  template: { contentSections: string[] },
  siteManifest: SiteCapabilityManifest,
) {
  const agentEditableSections = template.contentSections.filter(
    (section) => siteManifest.sections[section]?.allowedActions?.includes("draft") !== false,
  );
  const sectionEnum = z.enum(
    (agentEditableSections.length > 0 ? agentEditableSections : template.contentSections) as [
      string,
      ...string[],
    ],
  );
  return { agentEditableSections, sectionEnum };
}
