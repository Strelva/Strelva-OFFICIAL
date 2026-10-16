import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { harborSitePage } from "@/experience/workspace/preview/xa4-systems-fixture";

/** A fictional Harbor Dental home page for the XA-4 preview frames. Preview builds only; no scripts. */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const variant = new URL(request.url).searchParams.get("v") === "proposed" ? "proposed" : "live";
  return new Response(harborSitePage(variant), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
