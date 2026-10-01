import { hostedSiteAddressFromHost } from "@/lib/hosted-site-host";
import { hostedSiteContentSecurityPolicy, hostedSiteFile } from "@/products/websites/hosting";
import { websitePublicationStore } from "@/products/websites/publications";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function notFound(): Response {
  return new Response("This website is not available.", {
    status: 404,
    headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'" },
  });
}

/**
 * Public Strelva-hosted websites. The proxy rewrites <address>.<sites domain>
 * here. Generated HTML is only served on its own sites host, never on the
 * control-plane origin, so it cannot share the application's cookies.
 */
export async function GET(request: Request, context: { params: Promise<{ address: string; path?: string[] }> }) {
  const { address, path } = await context.params;
  if (hostedSiteAddressFromHost(request.headers.get("host") ?? "") !== address) return notFound();
  let site;
  try {
    site = await websitePublicationStore.readLive(address);
  } catch {
    return new Response("This website is temporarily unavailable.", {
      status: 503,
      headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
  if (!site) return notFound();
  const file = hostedSiteFile(site.pages, `/${(path ?? []).join("/")}`);
  if (!file) return notFound();
  return new Response(file.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Type": file.contentType,
      "Content-Security-Policy": hostedSiteContentSecurityPolicy(site.connectOrigin),
      // Short shared caching keeps a republish or take-offline visible quickly.
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      ETag: `"${site.contentHash}"`,
    },
  });
}
