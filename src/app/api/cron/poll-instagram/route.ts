/**
 * Instagram Media Polling Cron
 *
 * Polls Instagram for new media posts for all tenants with Instagram connections.
 * Runs daily at 6am UTC via Vercel Cron.
 *
 * Required env:
 * - CRON_SECRET: Bearer token for authorization
 * - INSTAGRAM_CLIENT_SECRET: For token refresh
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { getConnection, saveConnection, updateLastSynced } from "@/lib/connections";
import { alert } from "@/lib/monitoring";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";
import type { Connection } from "@/lib/types";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

const INSTAGRAM_REFRESH_URL = "https://graph.instagram.com/refresh_access_token";
const INSTAGRAM_MEDIA_URL = "https://graph.instagram.com/me/media";

interface InstagramMedia {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  caption?: string;
  timestamp: string;
  permalink: string;
}

interface InstagramMediaResponse {
  data?: InstagramMedia[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

function lastMediaKey(tenantId: string): string {
  return `instagram-media:last:${tenantId}`;
}

async function refreshAccessToken(connection: Connection): Promise<string | null> {
  try {
    const res = await fetch(
      `${INSTAGRAM_REFRESH_URL}?` +
        new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: connection.accessToken,
        })
    );

    if (!res.ok) {
      console.error(`[poll-instagram] Token refresh failed for ${connection.tenantId}:`, await res.text());
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = data.expires_in as number;

    // Update connection with new token
    await saveConnection({
      ...connection,
      accessToken: newAccessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

    return newAccessToken;
  } catch (err) {
    console.error(`[poll-instagram] Token refresh error for ${connection.tenantId}:`, err);
    return null;
  }
}

async function getValidAccessToken(connection: Connection): Promise<string | null> {
  // Check if token needs refresh (within 7 days of expiry)
  if (connection.expiresAt) {
    const expiresAt = new Date(connection.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() + sevenDays > expiresAt) {
      return refreshAccessToken(connection);
    }
  }
  return connection.accessToken;
}

async function fetchInstagramMedia(accessToken: string): Promise<InstagramMedia[]> {
  const params = new URLSearchParams({
    fields: "id,media_type,media_url,caption,timestamp,permalink",
    access_token: accessToken,
    limit: "25",
  });

  const res = await fetch(`${INSTAGRAM_MEDIA_URL}?${params}`);

  if (!res.ok) {
    throw new Error(`Instagram API error: ${res.status} ${await res.text()}`);
  }

  const data: InstagramMediaResponse = await res.json();
  return data.data ?? [];
}

async function pollTenant(tenantId: string): Promise<number> {
  const connection = await getConnection(tenantId, "instagram");
  if (!connection || connection.status !== "connected") return 0;

  // Get valid access token (refresh if needed)
  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    // Transition connected -> needs_reauth; a null token means the refresh token
    // is dead, so this is an authorization failure the owner fixes by reconnecting
    // (not a transient sync error) — the dashboard should show "reconnect", not
    // "sync failed". Alert once so a client's Instagram sync can't die silently.
    await saveConnection({
      ...connection,
      status: "needs_reauth",
    });
    alert("instagram_token_refresh_failed", "high", {
      tenantId,
      hint: "Client's Instagram connection needs re-auth — posts sync is stopped.",
    });
    return 0;
  }

  const redis = getRedis();
  if (!redis) {
    console.warn(`[poll-instagram] Redis not available for ${tenantId}`);
    return 0;
  }

  // Fetch recent media
  const media = await fetchInstagramMedia(accessToken);

  // Get last known media IDs
  let lastMediaIds: Set<string> = new Set();
  const cached = await redis.get<string[]>(lastMediaKey(tenantId));
  if (cached) lastMediaIds = new Set(cached);

  // Find new media
  const newMedia = media.filter((m) => !lastMediaIds.has(m.id));

  // Emit events for new posts
  for (const post of newMedia) {
    await addEvent({
      tenantId,
      source: "instagram",
      type: "mention",
      title: `New Instagram ${post.media_type.toLowerCase().replace("_", " ")}`,
      body: post.caption || "(no caption)",
      status: "pending",
      metadata: {
        mediaId: post.id,
        mediaType: post.media_type,
        mediaUrl: post.media_url,
        permalink: post.permalink,
        timestamp: post.timestamp,
      },
    });
  }

  // Update cache with all current media IDs
  if (media.length > 0) {
    await redis.set(
      lastMediaKey(tenantId),
      media.map((m) => m.id),
      { ex: 60 * 60 * 24 * 30 } // 30 days TTL
    );
  }

  // Update last synced timestamp
  await updateLastSynced(tenantId, "instagram");

  return newMedia.length;
}

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalNewPosts = 0;
  const processed: string[] = [];
  const errors: string[] = [];

  await mapPool(active, 8, async (tenant) => {
    try {
      const newCount = await pollTenant(tenant.id);
      if (newCount > 0) {
        totalNewPosts += newCount;
        processed.push(`${tenant.id}: ${newCount} new`);
      }
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[poll-instagram] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  });

  // Notify Slack on errors
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Instagram cron: ${errors.length} tenant(s) failed - ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("poll-instagram", { ok: errors.length === 0, processed: processed.length, failed: errors.length });

  return NextResponse.json({
    newPosts: totalNewPosts,
    processed: processed.length,
    failed: errors.length,
    details: { processed, errors },
  });
}
