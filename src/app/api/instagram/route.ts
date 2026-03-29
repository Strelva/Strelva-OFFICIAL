import { NextResponse } from "next/server";

// Instagram Graph API integration
// Requires INSTAGRAM_ACCESS_TOKEN in environment (long-lived token, refresh every 50 days)
// Token: Facebook Developer portal → Instagram Graph API → Business/Creator account required
// Basic Display API was deprecated December 4, 2024
//
// Alternative: Behold.so ($10/mo Starter) handles token refresh automatically
// Install @behold/react and use <BeholdWidget feedId="..." /> directly in InstagramFeed.tsx
// Set NEXT_PUBLIC_BEHOLD_FEED_ID in environment to use Behold instead of DIY API

interface InstagramPost {
  id: string;
  permalink: string;
  media_url: string;
  thumbnail_url?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  caption?: string;
  timestamp: string;
}

// Simple in-memory cache (5 min TTL)
let cachedPosts: InstagramPost[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const count = parseInt(url.searchParams.get("count") || "6");

  // Return cached if fresh
  if (cachedPosts && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ posts: cachedPosts.slice(0, count) });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    // No token configured — return empty (component shows fallback CTA)
    return NextResponse.json({ posts: [] });
  }

  try {
    const fields = "id,permalink,media_url,thumbnail_url,media_type,caption,timestamp";
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=${fields}&limit=${Math.min(count, 12)}&access_token=${token}`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      console.error("Instagram API error:", res.status, await res.text());
      return NextResponse.json({ posts: [] });
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

    cachedPosts = posts;
    cacheTime = Date.now();

    return NextResponse.json({ posts: posts.slice(0, count) });
  } catch (err) {
    console.error("Instagram fetch failed:", err);
    return NextResponse.json({ posts: [] });
  }
}
