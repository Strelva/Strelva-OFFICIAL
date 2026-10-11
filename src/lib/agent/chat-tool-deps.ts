import type { TenantConfig, SiteCapabilityManifest } from "../types";
import type { AskToolContext } from "./chat-tools";
import type { buildGbpTools, buildUndoTool, buildSiteDocumentTools } from "./shared-tools";

/**
 * What every tenant chat tool group closes over. buildTenantChatTools
 * (./chat-tools.ts) builds this once per turn and hands it to each group.
 */

/** Modules the chat tools use, imported lazily once per turn. */
export async function loadChatToolModules() {
  const [
    { getTemplateManifestForTenant },
    { getTenantConfig },
    { getConnections },
    { tenantSiteHost },
    { DISCOVERABLE_INTEGRATIONS, deriveIntelligenceStatus, getIntegrationCategories, normalizeIntegrationStatus },
    { sniffImageType },
    { manifestAllowsAction },
    { applySectionUpdate },
    { postCustomChangeRequest },
    { logger },
    { assertAgentToolCatalog },
  ] = await Promise.all([
    import("../template-manifests"),
    import("../tenants"),
    import("../connections"),
    import("@/platform/infra/brand"),
    import("../integration-registry"),
    import("../image-signature"),
    import("../site-capabilities"),
    import("../apply-section-update"),
    import("../custom-request-client"),
    import("@/platform/infra/logger"),
    import("../capabilities"),
  ]);
  return {
    getTemplateManifestForTenant,
    getTenantConfig,
    getConnections,
    tenantSiteHost,
    DISCOVERABLE_INTEGRATIONS,
    deriveIntelligenceStatus,
    getIntegrationCategories,
    normalizeIntegrationStatus,
    sniffImageType,
    manifestAllowsAction,
    applySectionUpdate,
    postCustomChangeRequest,
    logger,
    assertAgentToolCatalog,
  };
}

export type ChatToolModules = Awaited<ReturnType<typeof loadChatToolModules>>;

export interface ChatToolDeps {
  tenant: string;
  tenantConfig: TenantConfig | undefined;
  siteManifest: SiteCapabilityManifest;
  sectionEnum: AskToolContext["sectionEnum"];
  recordActionResult: AskToolContext["onResult"];
  ctx: AskToolContext;
  mods: ChatToolModules;
  gbpTools: ReturnType<typeof buildGbpTools>;
  undoTool: ReturnType<typeof buildUndoTool>;
  documentTools: ReturnType<typeof buildSiteDocumentTools>;
}

/**
 * Tool entries keyed by tool name. The `capability` key is legacy bookkeeping;
 * buildTenantChatTools strips it before the tools reach streamText.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatToolEntries = Record<string, { capability: string; def: any }>;
