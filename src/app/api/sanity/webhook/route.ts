import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getTenantConfig } from "@/lib/tenants";
import { logActivity } from "@/lib/storage";

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

function verifySignature(body: string, signature: string | null): boolean {
  if (!SANITY_WEBHOOK_SECRET) {
    // If no secret configured, skip verification (dev mode)
    console.warn("[Sanity Webhook] No SANITY_WEBHOOK_SECRET configured, skipping signature verification");
    return true;
  }

  if (!signature) {
    return false;
  }

  const hmac = createHmac("sha256", SANITY_WEBHOOK_SECRET);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  // Sanity sends signature as "sha256=<hex>"
  const providedSig = signature.replace(/^sha256=/, "");
  return providedSig === expectedSignature;
}

async function revalidateClientSite(
  tenantId: string,
  revalidateUrl: string,
  paths: string[] | "all"
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(revalidateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Client sites can validate this matches their expected tenant
        "X-Tenant-Id": tenantId,
      },
      body: JSON.stringify({
        tenant: tenantId,
        paths,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-sanity-signature");

    // Verify webhook signature
    if (!verifySignature(body, signature)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    let payload: SanityWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
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
          const result = await revalidateClientSite(
            config.id,
            config.revalidateUrl,
            "all"
          );

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
    const result = await revalidateClientSite(
      tenantId,
      tenantConfig.revalidateUrl,
      paths
    );

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
