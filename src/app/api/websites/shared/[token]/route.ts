import * as cheerio from "cheerio";
import { safeSitePathSchema } from "@/products/websites/index";
import { websiteRebuildReleaseEnabledForWorkspace, websiteRebuildReleaseMayBeOn } from "@/products/websites/index";
import { workspaceHttpActor,workspaceHttpFailure,workspaceJson } from "@/platform/workspaces/http";
import { authorizeWebsiteShare,verifyWebsiteShare,WEBSITE_SHARE_HEADERS } from "@/products/websites/index";
import { renderSiteDocumentHtml } from "@/products/websites/index";
import { websiteDocumentStore } from "@/products/websites/index";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
export async function GET(request:Request,context:{params:Promise<{token:string}>}) {
 if(!websiteRebuildReleaseMayBeOn())return workspaceJson({error:"Website rebuilds are unavailable."},404);
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in with the addressed account to view this private website."},401);const {token}=await context.params;const share=verifyWebsiteShare(token,process.env.SCAFFOLD_PREVIEW_SIGNING_SECRET??process.env.CRON_SECRET??"");await authorizeWebsiteShare(actor,share);
  // The sharing business's row decides (the recipient is not a member of it).
  if(!(await websiteRebuildReleaseEnabledForWorkspace(share.workspaceId))){const response=workspaceJson({error:"Website rebuilds are unavailable."},404);Object.entries(WEBSITE_SHARE_HEADERS).forEach(([key,value])=>response.headers.set(key,value));return response;}const row=await websiteDocumentStore.read({userId:share.createdBy,verifiedEmail:share.creatorEmail},{workspaceId:share.workspaceId,workId:share.workId,revision:share.revision});if(!row||row.contentHash!==share.contentHash)throw new WorkspaceAccessError();const page=safeSitePathSchema.parse(new URL(request.url).searchParams.get("page")??"/");if(!row.document.pages.some(value=>value.path===page))throw new WorkspaceAccessError();const html=cheerio.load(renderSiteDocumentHtml(row.document,page,{preview:true}));const paths=new Set(row.document.pages.map(value=>value.path));html("a[href]").each((_index,element)=>{
  const anchor=html(element);const href=anchor.attr("href")??"";
  if(!/^\/(?!\/)/.test(href))return;
  const link=new URL(href,"https://preview.strelva.invalid");
  if(!paths.has(link.pathname))return;
  const query=new URLSearchParams(link.search);query.set("page",link.pathname);
  anchor.attr("href",`/api/websites/shared/${token}?${query}${link.hash}`);
 });return new Response(html.html(),{headers:{...WEBSITE_SHARE_HEADERS,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'"}});}catch(error){const response=workspaceHttpFailure(error);Object.entries(WEBSITE_SHARE_HEADERS).forEach(([key,value])=>response.headers.set(key,value));return response;}
}
