/**
 * GET /biz/{handle}/llms.txt: the business's confirmed facts as plain text,
 * for AI agents that prefer a fact sheet to HTML (#309). Same gates as the
 * page: app host only, STRELVA_BUSINESS_PAGES=1, published.
 */
import { NextResponse } from "next/server";
import { appOrigin, businessFactSheet, businessPageUrl, loadPublishedBusinessPage } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  if (request.headers.get("x-tenant")) return notFound();
  const { handle } = await params;
  let page: Awaited<ReturnType<typeof loadPublishedBusinessPage>> = null;
  try {
    page = await loadPublishedBusinessPage(handle);
  } catch (error) {
    console.error("[biz llms.txt] read failed", error instanceof Error ? error.message : error);
    return new NextResponse("Temporarily unavailable\n", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  if (!page) return notFound();
  return new NextResponse(businessFactSheet(page.facts, businessPageUrl(appOrigin(), page.handle)), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
