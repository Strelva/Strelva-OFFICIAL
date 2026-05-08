import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "next-sanity/webhook";
import { getTenantConfig } from "@/lib/tenants";
import { logActivity } from "@/lib/storage";
import { revalidateClientSite } from "@/lib/revalidate-client";

/**
 * Sanity webhook endpoint for cache invalidation.
 * When content changes in Sanity, this endpoint triggers revalidation
 * on the client's production site.
 */

const SANITY_WEBHOOK_SECRET = process.env.SANITY_WEBHOOK_SECRET;

interface SanityWebhookPayload {
  _id: string;
  _type: string;
  _rev?: string;
  tenant?: string;
  // Content documents have a tenant field
  [key: string]: unknown;
}

// Map Sanity document types to their affected paths
const TYPE_TO_PATHS: Record<string, string[] | "all"> = {
  // Content sections affect specific pages
  hero: ["/"],
  services: ["/", "/services"],
  story: ["/", "/about"],
  testimonials: ["/"],
  events: ["/", "/events"],
  providers: ["/", "/providers"],
  contact: ["/", "/contact"],
  siteSettings: "all",
  faq: ["/", "/faq"],
  shop: ["/", "/shop"],
  products: ["/", "/products"],
  theme: "all",
  rewardsConfig: ["/rewards"],
  navigation: "all",
  footer: "all",
  // Blog posts
  blogPost: ["/blog"],
  // Page config affects all pages
  pageConfig: "all",
};

export async function POST(request: NextRequest) {
  try {
    if (!SANITY_WEBHOOK_SECRET) {
      console.error("[Sanity Webhook] SANITY_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const { body: payload, isValidSignature } = await parseBody<SanityWebhookPayload>(
      request,
      SANITY_WEBHOOK_SECRET
    );

    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const { _type, tenant: tenantId } = payload;

    if (!tenantId) {
      // Document without tenant field (e.g., tenant config itself)
      // For tenant document changes, extract id from the document
      if (_type === "tenant" && payload.id) {
        const config = await getTenantConfig(payload.id as string);
        if (config?.revalidateUrl) {
          const result = await revalidateClientSite(config.id, "all");

          await logActivity({
            text: `Cache invalidation triggered for tenant config change`,
            time: new Date().toISOString(),
            type: "cache-invalidation",
            actor: "ai",
          }, config.id);

          return NextResponse.json({
            revalidated: true,
            tenant: config.id,
            paths: "all",
            success: result.success,
            error: result.error,
          });
        }
      }

      return NextResponse.json({
        skipped: true,
        reason: "No tenant field on document",
      });
    }

    // Get tenant config to find revalidation URL
    const tenantConfig = await getTenantConfig(tenantId);
    if (!tenantConfig) {
      return NextResponse.json({
        skipped: true,
        reason: `Tenant not found: ${tenantId}`,
      });
    }

    if (!tenantConfig.revalidateUrl) {
      return NextResponse.json({
        skipped: true,
        reason: `No revalidateUrl configured for tenant: ${tenantId}`,
      });
    }

    // Determine which paths to revalidate
    const paths = TYPE_TO_PATHS[_type] || ["/"];

    // Trigger revalidation on client site
    const result = await revalidateClientSite(tenantId, paths);

    // Log the cache invalidation
    await logActivity({
      text: `Cache invalidation: ${_type} change triggered revalidation`,
      time: new Date().toISOString(),
      type: "cache-invalidation",
      section: _type,
      actor: "ai",
    }, tenantId);

    return NextResponse.json({
      revalidated: true,
      tenant: tenantId,
      documentType: _type,
      paths,
      success: result.success,
      error: result.error,
    });
  } catch (err) {
    console.error("[Sanity Webhook] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// HEAD for Sanity webhook verification
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
