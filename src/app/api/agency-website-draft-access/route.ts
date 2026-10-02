import { z } from "zod";
import { websiteRebuildReleaseEnabled, readAgencyWebsiteDocument, patchAgencyWebsiteDocument, previewAgencyWebsiteDocument } from "@/products/websites/index";
import { WEBSITE_PREVIEW_CSP } from "@/lib/website-preview-policy";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { createAgencyManagedWebsiteDraftAccessService } from "@/platform/offerings/agency-website-draft";
import {
  readWorkspaceBody,
  workspaceHttpActor,
  workspaceHttpFailure,
  workspaceJson,
  workspaceWriteGuard,
} from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
const service = () => createAgencyManagedWebsiteDraftAccessService();
const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{32}$/);

function readQuery(request: Request) {
  return new URL(request.url).searchParams;
}

async function nativeCustomerWebsiteHref(tenantId: string): Promise<string | null> {
  const tenant = await getTenantConfig(tenantId).catch(() => undefined);
  return tenant ? getTenantDashboardFallbackUrl(tenant, "/dashboard/site") : null;
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to inspect website delivery." }, 401);
    const query = readQuery(request);
    const agencyWorkspaceId = query.get("agencyWorkspaceId");
    if (agencyWorkspaceId) {
      return workspaceJson({ websites: await service().list(actor, uuid.parse(agencyWorkspaceId)) });
    }
    const bindingId = uuid.parse(query.get("bindingId"));
    if(query.get("document")==="preview"){
      if(!websiteRebuildReleaseEnabled())return workspaceJson({error:"Website rebuilds are not enabled."},503);
      const result=await previewAgencyWebsiteDocument(actor,bindingId,{workId:query.get("websiteWorkId"),section:query.get("section"),revision:query.get("revision"),contentHash:query.get("contentHash"),page:query.get("page")??"/"});
      return new Response(result.html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","Content-Security-Policy":WEBSITE_PREVIEW_CSP,"X-Website-Content-Hash":result.contentHash}});
    }
    if (query.get("document") === "1" && !websiteRebuildReleaseEnabled()) return workspaceJson({ grant: null, website: null, section: null, sections: [], previewHtml: null, previewHref: null, notEnabled: true });
    const grant = await service().read(actor, bindingId);
    if (query.get("document") === "1") {
      if (!grant) return workspaceJson({ grant: null, website: null, section: null, sections: [], previewHtml: null, previewHref: null });
      const websiteWorkId=query.get("websiteWorkId"); const section=query.get("section");
      return workspaceJson({ grant, ...await readAgencyWebsiteDocument(actor,bindingId,{ ...(websiteWorkId ? {workId:uuid.parse(websiteWorkId)} : {}), ...(section ? {section} : {}) }) });
    }
    if (!grant) return workspaceJson({ grant: null, state: null, customerWebsiteHref: null });
    const customerWebsiteHref = await nativeCustomerWebsiteHref(grant.tenantId);
    const section = query.get("section");
    if (!section) return workspaceJson({ grant, state: null, customerWebsiteHref });
    return workspaceJson({ grant, state: await service().state(actor, bindingId, section), customerWebsiteHref });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to change website delivery." }, 401);
    const raw=await readWorkspaceBody(request,150_000);
    if(raw && typeof raw === "object" && "action" in raw && raw.action === "prepare_document") {
      if (!websiteRebuildReleaseEnabled()) return workspaceJson({ error: "Website rebuilds are not enabled." }, 503);
      const {action:_action,...input}=raw;
      return workspaceJson(await patchAgencyWebsiteDocument(actor,input),201);
    }
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("grant"), deliveryId: uuid, bindingId: uuid }).strict(),
      z.object({ action: z.literal("revoke"), grantId: uuid }).strict(),
      z.object({
        action: z.literal("prepare"), assignmentId: uuid, bindingId: uuid,
        section: z.string().trim().min(1).max(80), data: z.record(z.string(), z.unknown()),
        expectedRevision: z.number().int().nonnegative(), expectedHash: hash,
      }).strict(),
    ]).parse(raw);
    const access = service();
    if (input.action === "grant") return workspaceJson({ grant: await access.grant(actor, input.deliveryId, input.bindingId) }, 201);
    if (input.action === "revoke") return workspaceJson({ grant: await access.revoke(actor, input.grantId) });
    return workspaceJson({ preparation: await access.prepare(actor, input.assignmentId, input.bindingId, input.section, input.data, input.expectedRevision, input.expectedHash) }, 201);
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
