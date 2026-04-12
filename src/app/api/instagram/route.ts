import { NextResponse } from "next/server";
import { getTenantConfig } from "@/lib/tenants";

// Instagram feed API — two providers, one shape.
//
// Priority:
// 1. Behold.so (tenant.beholdFeedId) — hosted proxy, no token management
// 2. Instagram Graph API (env INSTAGRAM_ACCESS_TOKEN) — legacy, tokens expire
// 3. Neither configured → empty array, 200 (component shows fallback CTA)

interface InstagramPost {
  id: string;
  permalink: string;
  media_url: string;
  thumbnail_url?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  caption?: string;
  timestamp: string;
}

// --- Cache (1 hour TTL, keyed by source) ---

const cache = new Map<string, { posts: InstagramPost[]; time: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key: string): InstagramPost[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.posts;
  return null;
}

function setCache(key: string, posts: InstagramPost[]) {
  cache.set(key, { posts, time: Date.now() });
}

// --- Behold.so ---

interface BeholdMediaItem {
  id: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  mediaType: string;
  permalink: string;
  caption?: string;
  timestamp: string;
}

function normalizeBeholdPost(item: BeholdMediaItem): InstagramPost {
  const typeMap: Record<string, InstagramPost["media_type"]> = {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL_ALBUM: "CAROUSEL_ALBUM",
  };
  return {
    id: item.id,
    permalink: item.permalink,
    media_url: item.mediaUrl,
    thumbnail_url: item.thumbnailUrl || undefined,
    media_type: typeMap[item.mediaType] || "IMAGE",
    caption: item.caption || undefined,
    timestamp: item.timestamp,
  };
}

async function fetchBehold(feedId: string, count: number): Promise<InstagramPost[]> {
  const cacheKey = `behold:${feedId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached.slice(0, count);

  const res = await fetch(`https://feeds.behold.so/${feedId}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    console.error(`Behold API error: ${res.status} for feed ${feedId}`);
    return [];
  }

  const data = await res.json();
  const media: BeholdMediaItem[] = data.media || data || [];
  const posts = media.map(normalizeBeholdPost);

  setCache(cacheKey, posts);
  return posts.slice(0, count);
}

// --- Instagram Graph API (legacy fallback) ---

async function fetchGraphApi(token: string, count: number): Promise<InstagramPost[]> {
  const cacheKey = `graph:${token.slice(-8)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached.slice(0, count);

  const fields = "id,permalink,media_url,thumbnail_url,media_type,caption,timestamp";
  const res = await fetch(
    `https://graph.instagram.com/me/media?fields=${fields}&limit=${Math.min(count, 12)}&access_token=${token}`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) {
    console.error("Instagram Graph API error:", res.status, await res.text());
    return [];
  }

  const data = await res.json();
  const posts: InstagramPost[] = (data.data || []).map((post: Record<string, unknown>) => ({
    id: post.id,
    permalink: post.permalink,
    media_url: post.media_url,
    thumbnail_url: post.thumbnail_url || undefined,
    media_type: post.media_type,
    caption: post.caption || undefined,
    timestamp: post.timestamp,
  }));

  setCache(cacheKey, posts);
  return posts.slice(0, count);
}

// --- Route handler ---

export async function GET(request: Request) {
  const url = new URL(request.url);
  const count = parseInt(url.searchParams.get("count") || "6");
  const tenantId = url.searchParams.get("tenant");

  // 1. Try Behold via tenant config
  if (tenantId) {
    const config = await getTenantConfig(tenantId);
    if (config?.beholdFeedId) {
      const posts = await fetchBehold(config.beholdFeedId, count);
      return NextResponse.json({ posts });
    }
  }

  // 2. Fall back to Graph API via env token
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token) {
    const posts = await fetchGraphApi(token, count);
    return NextResponse.json({ posts });
  }

  // 3. Neither configured — empty array, not an error
  return NextResponse.json({ posts: [] });
}
