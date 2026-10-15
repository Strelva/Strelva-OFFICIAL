import { z } from "zod";
import { getTenantConfig } from "@/lib/tenants";
import { isRateLimitedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { systemOriginId } from "@/platform/systems/invariants";
import { readExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import { PostgresServiceRequestStore, ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestService } from "@/platform/service-requests";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createSiteChangeStore, sitesByCodeReleased, verifySiteRelease } from "@/products/websites/server";
import { recordSiteChangeSchema, siteChangeRequestCommand, siteChangeStage } from "@/products/websites/client";
import { siteEditingFor } from "@/products/websites/client";

import { readSiteChangeProvider } from "@/platform/service-requests/provider-options";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const askSchema = z.object({
  action: z.literal("ask"),
  workspaceId: uuid,
  systemId: uuid,
  request: z.string().trim().min(3).max(3_000),
  page: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
const recordSchema = z.object({
  action: z.literal("record"),
  workspaceId: uuid,
  requestId: uuid,
  /** The System the Request is on. A deploy names it so Strelva can check that site's live commit. */
  systemId: uuid.optional(),
  step: recordSiteChangeSchema,
}).strict();
const bodySchema = z.discriminatedUnion("action", [askSchema, recordSchema]);

async function released(workspaceId: string, userId: string): Promise<boolean> {
  return workspaceReleaseEnabled() && await systemsReleaseEnabledForWorkspace(workspaceId, { operator: false, tester: false, userId }).catch(() => false);
}

/**
 * The read-back for a deploy: the live site's own declared commit against the
 * one reported. Only an approved Request is checked; any other falls through to
 * the database, which refuses it by order or by authority before anything is recorded.
 */
async function checkedReadBack(actor: WorkspaceActor, store: ReturnType<typeof createSiteChangeStore>, workspaceId: string, systemId: string, requestId: string, commitSha: string) {
  const item = (await store.list(actor, workspaceId, systemId)).find((entry) => entry.id === requestId);
  if (!item || siteChangeStage(item) !== "approved") return "not_checked" as const;
  const snapshot = await readExistingSystemsSnapshot(actor, workspaceId);
  const site = snapshot.managedWebsites.find((entry) => systemOriginId(workspaceId, { kind: "tenant", ref: entry.tenantStableId }) === systemId);
  if (!site) return "not_checked" as const;
  return (await verifySiteRelease(site.tenantId, commitSha)).readBack;
}

/**
 * GET /api/workspace/site-changes?workspaceId=…&systemId=…
 * The repo-change Requests on one website System, with their preview,
 * decision and deploy receipts. Any member of the business may read them.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Not available." }, 404);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const workspaceId = uuid.safeParse(params.get("workspaceId"));
    const systemId = uuid.safeParse(params.get("systemId"));
    if (!workspaceId.success || !systemId.success) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
    if (!(await released(workspaceId.data, actor.userId))) return workspaceJson({ error: "Not available." }, 404);
    return workspaceJson({ requests: await createSiteChangeStore().list(actor, workspaceId.data, systemId.data) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

/**
 * POST /api/workspace/site-changes
 * - `ask`: an owner or admin asks for a change to the site's repo. Files a
 *   Request to the current agency at Asked; nothing on the site changes.
 * - `record`: a step on that Request. The agency records previews and deploys;
 *   an owner approves or declines a preview. The database enforces who and
 *   in what order. With `sites_by_code` on, a deploy's read-back is Strelva's
 *   own check of the live site, never what the caller sent.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Not available." }, 404);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedAsync(`site-changes:${actor.userId}`, 20)) return workspaceJson({ error: "Too many requests. Try again in a minute." }, 429);
    const body = bodySchema.parse(await readWorkspaceBody(request, 20_000));
    if (!(await released(body.workspaceId, actor.userId))) return workspaceJson({ error: "Not available." }, 404);
    const store = createSiteChangeStore();
    if (body.action === "record") {
      let step = body.step;
      if (step.kind === "deployed") {
        if (await sitesByCodeReleased(body.workspaceId, { operator: false, tester: false, userId: actor.userId })) {
          if (!body.systemId) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
          step = { ...step, readBack: await checkedReadBack(actor, store, body.workspaceId, body.systemId, body.requestId, step.commitSha) };
        } else if (!step.readBack) {
          return workspaceJson({ error: "Choose whether the deploy was checked on the live site." }, 400);
        }
      }
      const receipt = await store.record(actor, body.workspaceId, body.requestId, step);
      return workspaceJson({ receipt });
    }
    // The System must be this business's own managed website, found through its link.
    const snapshot = await readExistingSystemsSnapshot(actor, body.workspaceId);
    const site = snapshot.managedWebsites.find((item) => systemOriginId(body.workspaceId, { kind: "tenant", ref: item.tenantStableId }) === body.systemId);
    if (!site) return workspaceJson({ error: "This site isn't connected to this business." }, 404);
    const config = await getTenantConfig(site.tenantId).catch(() => undefined);
    const service = new ServiceRequestService(PostgresServiceRequestStore);
    const filed = await service.execute(actor, siteChangeRequestCommand({
      provider: await readSiteChangeProvider(actor, body.workspaceId), workspaceId: body.workspaceId, systemId: body.systemId, tenantStableId: site.tenantStableId,
      editing: siteEditingFor(config ?? { id: site.tenantId }), words: body.request, page: body.page, idempotencyKey: body.idempotencyKey,
    }));
    return workspaceJson({ requestId: filed.id, requests: await store.list(actor, body.workspaceId, body.systemId) }, 201);
  } catch (error) {
    if (error instanceof ServiceRequestAccessError) return workspaceJson({ error: "Only an owner or admin of this business can ask for a change here." }, 403);
    if (error instanceof ServiceRequestConflictError) return workspaceJson({ error: error.message }, 409);
    if (error instanceof WorkspaceAccessError) return workspaceJson({ error: error.message }, 403);
    return workspaceHttpFailure(error);
  }
}
