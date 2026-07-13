import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getContent, SECTION_TO_TYPE } from "@/lib/storage";
import { collectTenantMedia } from "@/lib/media-store";
import type { ContentSection } from "@/lib/types";

const CONTENT_SECTIONS = Object.keys(SECTION_TO_TYPE) as ContentSection[];
const URL_KEY_PATTERN = /(url|image|logo|photo|media|asset)/i;

function collectUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (!value) return urls;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return urls;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      if (typeof nested === "string" && URL_KEY_PATTERN.test(key) && /^https?:\/\//i.test(nested)) {
        urls.add(nested);
        return;
      }
      collectUrls(nested, urls);
    });
  }
  return urls;
}

function jsonAttachment(body: unknown, filename: string) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const blocked = await requireTenantPermission(tenant, "billing:manage");
  if (blocked) return blocked;

  const referencedUrls = new Set<string>();
  await Promise.all(
    CONTENT_SECTIONS.map(async (section) => {
      try {
        collectUrls(await getContent(section, tenant), referencedUrls);
      } catch {}
    }),
  );

  // Completeness matters for a departing client's export — if a media source was
  // down, report "unavailable" so they retry rather than trust an empty library.
  const { assets: libraryAssets, degraded } = await collectTenantMedia(tenant);
  const libraryStatus: "included" | "unavailable" = degraded ? "unavailable" : "included";

  const payload = {
    exportedAt: new Date().toISOString(),
    tenant,
    libraryStatus,
    libraryAssets,
    referencedUrls: Array.from(referencedUrls).sort(),
    checklist: [
      "Download original files from each listed URL before changing DNS.",
      "Keep filenames and alt-text mapping together for the next provider.",
      "Confirm logo, hero images, service photos, provider photos, and product photos are present.",
      "Ask Strelva for any source files that are not represented by a public URL.",
    ],
  };

  return jsonAttachment(payload, `${tenant}-asset-manifest.json`);
}
