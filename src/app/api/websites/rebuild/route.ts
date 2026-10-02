import { after } from "next/server";
import { z } from "zod";
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { createWebsiteRebuild, listWebsiteRebuilds, retryWebsiteRebuild } from "@/products/websites/index";
import { rebuildHttpFailure } from "../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!websiteRebuildReleaseEnabled()) return workspaceJson({ error: "Website rebuilds are not enabled." },503);
  const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to open rebuilds." },401);
  try { const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId")); return workspaceJson({ workspaceId, rebuilds: await listWebsiteRebuilds(actor,workspaceId) }); } catch (error) { return rebuildHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!websiteRebuildReleaseEnabled()) return workspaceJson({ error: "Website rebuilds are not enabled." },503);
  const denied = workspaceWriteGuard(request); if (denied) return denied;
  const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to rebuild a website." },401);
  try {
    const body = z.object({ workspaceId: z.string().uuid() }).passthrough().parse(await readWorkspaceBody(request));
    const { workspaceId, ...input } = body;
    const record = await createWebsiteRebuild(actor,workspaceId,input,true);
    if (record.rebuild.status === "building" && record.rebuild.revision === 0) after(async () => { try { await retryWebsiteRebuild(actor,record.workId,{ expectedRevision: 0 }); } catch { /* A concurrent retry or revoked membership wins; never overwrite it. */ } });
    return workspaceJson(record,record.rebuild.status === "building" ? 202 : 200);
  } catch (error) { return rebuildHttpFailure(error); }
}
