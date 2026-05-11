import { NextResponse } from "next/server";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, verifyAuth } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl } from "@/lib/tenant-urls";
import { normalizePreviewPath, prepareEditablePreviewHtml } from "@/lib/preview-html";

export async function GET(request: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const tenantConfig = await getTenantConfig(tenant);
    if (!tenantConfig) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const siteUrl = getTenantPublicUrl(
      tenantConfig,
      getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV
    );
    const url = new URL(request.url);
    const previewPath = normalizePreviewPath(url.searchParams.get("path"));
    const target = new URL(previewPath, siteUrl);
    target.searchParams.set("preview", "true");
    target.searchParams.set("edit", "true");

    if (target.origin !== new URL(siteUrl).origin) {
      return NextResponse.json({ error: "Invalid preview path" }, { status: 400 });
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
      return NextResponse.json(
        { error: "Edit preview unavailable" },
        { status: upstream.ok ? 502 : upstream.status }
      );
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
    return NextResponse.json({ error: "Failed to load edit preview" }, { status: 500 });
  }
}
