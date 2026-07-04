import { NextResponse } from "next/server";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, verifyAuth } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { normalizePreviewPath, prepareEditablePreviewHtml } from "@/lib/preview-html";

// This endpoint is loaded as the src of the site-editor iframe, so an error here
// renders INSIDE the iframe. Returning JSON dumped raw `{"error":"..."}` with the
// browser's pretty-print — the machine leaking through. Return a calm, on-brand
// "Preview unavailable" state with a Retry instead. Status is preserved for
// tooling; the iframe still renders the HTML body.
function previewUnavailable(status: number): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Preview unavailable</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#0d0f0e;color:#e7e9e7;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .card{max-width:22rem;padding:1.5rem;text-align:center}
  h1{font-size:1rem;font-weight:600;margin:0 0 .5rem}
  p{font-size:.8125rem;line-height:1.5;color:#9aa39c;margin:0 0 1.25rem}
  button{appearance:none;border:0;border-radius:.5rem;background:#96bd96;color:#12211a;
         font-size:.8125rem;font-weight:600;padding:.55rem 1.1rem;cursor:pointer}
  button:hover{opacity:.9}
</style>
</head>
<body>
  <div class="card">
    <h1>Preview unavailable</h1>
    <p>We couldn't load your site preview just now. This is usually temporary — give it another try.</p>
    <button type="button" onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(request: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const tenantConfig = await getTenantConfig(tenant);
    const siteUrl = tenantConfig
      ? getTenantPublicUrl(
          tenantConfig,
          getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV
        )
      : getTenantPublicUrlFromDomainMap(tenant);
    if (!siteUrl) {
      return previewUnavailable(404);
    }
    const url = new URL(request.url);
    const previewPath = normalizePreviewPath(url.searchParams.get("path"));
    const target = new URL(previewPath, siteUrl);
    target.searchParams.set("preview", "true");
    target.searchParams.set("edit", "true");

    if (target.origin !== new URL(siteUrl).origin) {
      return previewUnavailable(400);
    }

    const upstream = await fetch(target, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ScaffoldWebEditPreview/1.0",
      },
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.includes("text/html")) {
      return previewUnavailable(upstream.ok ? 502 : upstream.status);
    }

    const html = prepareEditablePreviewHtml(await upstream.text(), `${target.origin}/`);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[edit-preview GET]", err);
    return previewUnavailable(500);
  }
}
