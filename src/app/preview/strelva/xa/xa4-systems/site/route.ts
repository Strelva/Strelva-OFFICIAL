import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { harborSitePage } from "@/experience/workspace/preview/xa4-systems-fixture";

/** A fictional Harbor Dental home page for the XA-4 preview frames. Preview builds only; no scripts. */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) notFound();
  // After the preview's Make real, the live page is the one that landed (read back by reloading the frame).
  const landed = /(?:^|;\s*)xa4-landed=1(?:;|$)/.test(request.headers.get("cookie") ?? "");
  const variant = new URL(request.url).searchParams.get("v") === "proposed" || landed ? "proposed" : "live";
  return new Response(harborSitePage(variant), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
