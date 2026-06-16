/**
 * Strelva v1 public content API.
 *
 * Stable contract consumed by custom-repo client sites. The response shape
 * here is the canonical v1 contract — change it only by versioning (add a
 * v2 sibling). Tests in `contracts.test.ts` lock the shape.
 */
import { NextResponse } from "next/server";
import type { ContentMap, ContentSection } from "@/lib/types";
import { getContent, SECTION_TO_TYPE } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; section: string }> }
) {
  const { tenant, section } = await params;

  if (!/^[a-z0-9-]+$/.test(tenant)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }

  try {
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Only reject a TRULY unknown section. We intentionally do NOT gate public
    // reads on the capability manifest: the manifest gates the editing UI, not
    // what a deployed client repo can fetch. A known section that's been dropped
    // from the manifest must still return its stored content (or typed default)
    // — returning 400 here would make the client fetcher fall back to empty and
    // silently wipe live content from the client's site.
    if (!(section in SECTION_TO_TYPE)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const preview = new URL(request.url).searchParams.get("preview") === "true";
    const data = await getContent(
      section as ContentSection,
      tenant,
      preview ? { preview: true } : undefined,
    );
    return NextResponse.json(data as ContentMap[ContentSection]);
  } catch (err) {
    console.error("[v1 content GET]", tenant, section, err);
    return NextResponse.json({ error: "Failed to load content" }, { status: 500 });
  }
}
