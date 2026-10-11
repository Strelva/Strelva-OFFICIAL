import { getPathHostedSite } from "@/products/websites/index";
import { sitePageUrl } from "@/platform/infra/brand";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getPathHostedSite(tenant);
  if (!site) return new Response("Not found", { status: 404 });
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const urls = site.document.pages.map(page => `<url><loc>${escape(sitePageUrl(page.path, site.origin))}</loc></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" } });
}
