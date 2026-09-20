import { z } from "zod";
import { WEBSITE_PREVIEW_CSP } from "@/lib/website-preview-policy";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceJson } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readWebsite, renderWebsiteCandidate, exportWebsiteCandidate, WebsiteCandidateMismatchError } from "@/products/websites/server";

export async function websiteCandidateResponse(request: Request, params: Promise<{ workId: string }>, kind: "preview" | "export") {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in to open this website." }, 401);
  try {
    const workId = z.string().uuid().parse((await params).workId);
    const query = new URL(request.url).searchParams;
    const selection = z.object({
      revision: z.coerce.number().int().positive(),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      page: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    }).parse({ revision: query.get("revision"), contentHash: query.get("contentHash"), page: query.get("page") ?? undefined });
    const record = await readWebsite(actor, workId);
    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "X-Website-Content-Hash": selection.contentHash,
    };
    if (kind === "export") {
      headers["Content-Type"] = "application/x-tar";
      headers["Content-Disposition"] = `attachment; filename="website-${workId}-r${selection.revision}.tar"`;
      return new Response(Buffer.from(exportWebsiteCandidate(record, selection)), { headers });
    }
    headers["Content-Type"] = "text/html; charset=utf-8";
    headers["Content-Security-Policy"] = WEBSITE_PREVIEW_CSP;
    return new Response(renderWebsiteCandidate(record, selection), { headers });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This website is unavailable to your account." }, 403);
    if (error instanceof WebsiteCandidateMismatchError) return workspaceJson({ error: error.message }, 409);
    if (error instanceof z.ZodError) return workspaceJson({ error: "Check the website revision and content hash." }, 400);
    return workspaceJson({ error: "This website candidate could not be opened. Reload its saved work." }, 503);
  }
}
