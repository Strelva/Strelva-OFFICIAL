/**
 * Redis-backed cache for the client-site public read path.
 *
 * Why this exists: client sites read tenant content via the `/api/v1/content`
 * and `/api/v1/page-config` endpoints. The historical implementation hit
 * Sanity CDN on every read, which adds latency, costs GROQ overhead per
 * field, and gives no tenant-scoped invalidation primitive. Redis sits in
 * front of that path so:
 *
 *   - reads are sub-millisecond on cache hit
 *   - writes that flow through `setContent` / `setPageConfig` populate the
 *     cache write-through, eliminating the thundering-herd that would
 *     follow an invalidate-only strategy
 *   - Sanity and the dev-file path remain the source of truth on cache miss
 *     so Studio-direct edits, dev-mode usage, and Redis outages all degrade
 *     gracefully
 *
 * Set-and-forget: Redis writes are best-effort. If Redis is down or the
 * write fails, we log and return as if nothing happened — the next miss
 * after the TTL repopulates.
 */

import { getRedis } from "../redis";
import type { ContentMap, ContentSection, SitePageConfig } from "../types";

const CONTENT_TTL_SECONDS = 300; // 5 minutes — covers Studio-direct edits
const PAGE_CONFIG_TTL_SECONDS = 300;

function contentKey(tenant: string, section: ContentSection): string {
  return `reb:content:${tenant}:${section}`;
}

function pageConfigKey(tenant: string): string {
  return `reb:page-config:${tenant}`;
}

/** Returns the cached content for a section, or null on miss or no Redis. */
export async function getCachedContent<K extends ContentSection>(
  section: K,
  tenant: string,
): Promise<ContentMap[K] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<ContentMap[K]>(contentKey(tenant, section));
    return cached ?? null;
  } catch (err) {
    console.warn("[content-cache] read failed", tenant, section, err);
    return null;
  }
}

/** Write-through cache populate. Best-effort; logs on failure. */
export async function setCachedContent<K extends ContentSection>(
  section: K,
  tenant: string,
  data: ContentMap[K],
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(contentKey(tenant, section), data, {
      ex: CONTENT_TTL_SECONDS,
    });
  } catch (err) {
    console.warn("[content-cache] write failed", tenant, section, err);
  }
}

/** Drop the cached section. Used when a write fails partway through. */
export async function invalidateCachedContent(
  section: ContentSection,
  tenant: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(contentKey(tenant, section));
  } catch (err) {
    console.warn("[content-cache] invalidate failed", tenant, section, err);
  }
}

export async function getCachedPageConfig(
  tenant: string,
): Promise<SitePageConfig | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<SitePageConfig>(pageConfigKey(tenant));
    return cached ?? null;
  } catch (err) {
    console.warn("[content-cache] page-config read failed", tenant, err);
    return null;
  }
}

export async function setCachedPageConfig(
  tenant: string,
  config: SitePageConfig,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(pageConfigKey(tenant), config, {
      ex: PAGE_CONFIG_TTL_SECONDS,
    });
  } catch (err) {
    console.warn("[content-cache] page-config write failed", tenant, err);
  }
}

export async function invalidateCachedPageConfig(tenant: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(pageConfigKey(tenant));
  } catch (err) {
    console.warn("[content-cache] page-config invalidate failed", tenant, err);
  }
}
