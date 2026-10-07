import { z } from "zod";
import { workspaceJson } from "@/platform/workspaces/http";
import { websiteDocumentStore } from "@/products/websites/index";
import { readWebsiteRebuild } from "@/products/websites/index";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { rebuildHttp } from "../../rebuild-http";

export const dynamic = "force-dynamic";
const inputSchema = z.object({ tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), candidateRevision: z.number().int().positive(), candidateContentHash: z.string().regex(/^[a-f0-9]{64}$/), commandId: z.string().uuid(), domainRestored: z.literal(true), fallbackVerified: z.literal(true) }).strict();

/** DNS is a separate, authorized owner/operator action; this never writes DNS. */
export const POST = (request: Request, context: { params: Promise<{ workId: string }> }) => rebuildHttp(request, context.params, true, async (actor, workId, raw) => {
  const record = await readWebsiteRebuild(actor, workId);
  if (!(await systemsReleaseEnabledForWorkspace(record.workspaceId))) return workspaceJson({ error: "Website cutover undo is not enabled." }, 503);
  const input = inputSchema.parse(raw);
  const receipt = await websiteDocumentStore.undoLinkedCutover!(actor, { workspaceId: record.workspaceId, workId, tenantId: input.tenantId, revision: input.candidateRevision, contentHash: input.candidateContentHash, commandId: input.commandId, domainRestored: input.domainRestored, fallbackVerified: input.fallbackVerified });
  return workspaceJson({ receipt, domain: "Restored by the owner or operator; no DNS write was performed here." });
});
