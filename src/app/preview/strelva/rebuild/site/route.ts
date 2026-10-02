import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { fixtureSiteDocument, mooneyFixtureDocument } from "@/experience/websites/rebuild-fixture";
import { renderSiteDocumentHtml } from "@/products/websites/index";
import { siteDocumentSchema } from "@/products/websites/client";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  return new Response(renderSiteDocumentHtml(new URL(request.url).searchParams.get("example") === "mooney" ? mooneyFixtureDocument : fixtureSiteDocument, "/", { preview: true }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; form-action 'none'" } });
}
export async function POST(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  if (new URL(request.url).origin !== request.headers.get("origin")) return new Response("Forbidden", { status: 403 });
  const text = await request.text();
  if (text.length > 2_000_000) return new Response("Too large", { status: 413 });
  let body: unknown; try { body = JSON.parse(text); } catch { return new Response("Invalid JSON",{status:400}); }
  const parsed = siteDocumentSchema.safeParse(body);
  if (!parsed.success) return new Response("Invalid fixture document", { status: 400 });
  return new Response(renderSiteDocumentHtml(parsed.data,new URL(request.url).searchParams.get("page") ?? "/",{preview:true}),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'none'"}});
}
