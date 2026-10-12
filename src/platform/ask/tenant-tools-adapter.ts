/**
 * The one door from Ask Strelva to the tenant model (spec section 5, "New"):
 * the workspace route reaches the tenant tools, prompt context and Google
 * grant through this file only, so `check:boundaries` sees one workspace →
 * src/lib edge for the agent tools instead of eighteen.
 */
import type { Tool } from "ai";
import type { AgentActionResult } from "@/lib/agent-results";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export interface TenantAskTools {
  tools: Record<string, Tool>;
  siteName: string;
  gbpWriteAllowed: boolean;
  /** The tenant's business context for the prompt (business record, site, performance). */
  businessContext: string;
}

/** Build the tenant chat tools for one linked site, with Ask's settings:
 * every section edit routed to review, and the given per-call re-check. */
export async function loadTenantAskTools(input: {
  tenantId: string;
  actor: WorkspaceActor;
  onResult: (result: AgentActionResult) => void;
}): Promise<TenantAskTools> {
  const [{ getTenantConfig }, { getTemplateManifestForTenant }, { getSiteCapabilityManifest }, shared, prompt, capabilities] = await Promise.all([
    import("@/lib/tenants"),
    import("@/lib/template-manifests"),
    import("@/lib/site-capabilities"),
    import("@/lib/agent-shared"),
    import("@/lib/agent-prompt-shared"),
    import("@/lib/capabilities"),
  ]);
  const [tenantConfig, template, siteManifest] = await Promise.all([
    getTenantConfig(input.tenantId),
    getTemplateManifestForTenant(input.tenantId),
    getSiteCapabilityManifest(input.tenantId),
  ]);
  const { sectionEnum } = shared.resolveEditableSections(template, siteManifest);
  const gbpWriteAllowed = await shared.resolveGbpWriteAllowed(input.tenantId, tenantConfig);
  const tools = await shared.buildTenantChatTools({
    tenantId: input.tenantId,
    tenantConfig,
    siteManifest,
    sectionEnum,
    actor: input.actor,
    gbpWriteAllowed,
    onResult: input.onResult,
    forceReview: true,
  });
  const businessContext = await prompt.buildAgentSystemPrompt(input.tenantId, capabilities.capabilityPromptFragment());
  return { tools, siteName: tenantConfig?.siteName || input.tenantId, gbpWriteAllowed, businessContext };
}

/** Re-read whether the site may draft Google Business writes (per call). */
export async function tenantGoogleWriteGranted(tenantId: string): Promise<boolean> {
  const [{ getTenantConfig }, shared] = await Promise.all([import("@/lib/tenants"), import("@/lib/agent-shared")]);
  return shared.resolveGbpWriteAllowed(tenantId, await getTenantConfig(tenantId));
}
