import { z } from "zod";
import { isContentSection } from "./types";
import type { TenantConfig, SiteCapabilityManifest } from "./types";

// The shared tool factories and the tenant chat tool set live in ./agent/ and
// are re-exported here, so this stays the one import path for agent tools.
export { buildGbpTools, buildUndoTool, buildSiteDocumentTools } from "./agent/shared-tools";
export type { GbpToolHooks, UndoToolHooks } from "./agent/shared-tools";
export { buildTenantChatTools, chatToolLabel, TENANT_CHAT_GBP_WRITE_TOOLS } from "./agent/chat-tools";
export type { AskToolContext, AskToolRefusal } from "./agent/chat-tools";

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
 * inputs. Two inputs decide the set:
 *
 *  - the template's built-in `contentSections` (the platform default), and
 *  - the site capability manifest, which a custom repo can publish (B4) to declare
 *    the registered content sections its LIVE site actually renders.
 *
 * A section is editable only when the resolved manifest declares it and does not
 * disallow "draft". The base is the template's manifest-supported content sections,
 * PLUS any registered content section the manifest declares that the template doesn't
 * have. Render-component keys and arbitrary remote strings are capabilities, not
 * writable content entities, and are excluded.
 * Falls back to the full template list when the filter would leave nothing. Lifted from
 * the streaming route so both agent paths constrain the model to the same sections.
 * (The manifest is also passed into `applySectionUpdate` to gate publish; this enum just
 * keeps the model from targeting a forbidden section.)
 */
export function resolveEditableSections(
  template: { contentSections: string[]; components?: Record<string, unknown> },
  siteManifest: SiteCapabilityManifest,
) {
  const draftable = (section: string) => {
    const entry = siteManifest.sections[section];
    return Boolean(entry) && entry!.allowedActions?.includes("draft") !== false;
  };

  const templateSet = new Set(template.contentSections);
  const componentKeys = new Set(Object.keys(template.components ?? {}));

  const fromTemplate = template.contentSections.filter(isContentSection).filter(draftable);
  // Sections a custom repo declared via its remote manifest that the template
  // doesn't list. Component render-keys are excluded — they aren't content.
  const declaredExtras = Object.keys(siteManifest.sections).filter(
    (section) =>
      isContentSection(section) &&
      !templateSet.has(section) &&
      !componentKeys.has(section) &&
      draftable(section),
  );

  const agentEditableSections = [...fromTemplate, ...declaredExtras];
  const sectionEnum = z.enum(
    (agentEditableSections.length > 0 ? agentEditableSections : template.contentSections) as [
      string,
      ...string[],
    ],
  );
  return { agentEditableSections, sectionEnum };
}
