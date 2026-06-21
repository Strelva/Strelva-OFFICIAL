/**
 * Social post storage - drafts, scheduled, and published posts.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres `social_posts`
 * table (Sanity fallback on read). Writes go to Postgres AND Sanity while both
 * are configured so the transition is reversible; once Sanity is removed,
 * `hasSanity` is false and only Postgres is written. Default off (Sanity path).
 */

import path from "path";
import type { SocialPost } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, readDevFile, writeDevFile } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase } from "../db/client";
import type { Row, Insert } from "../db/client";

const DEV_SOCIAL_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-social-${tenant}.json`);

async function readDevSocial(tenant: string): Promise<SocialPost[]> {
  return readDevFile(DEV_SOCIAL_PATH(tenant), []);
}

async function writeDevSocial(tenant: string, posts: SocialPost[]): Promise<void> {
  return writeDevFile(DEV_SOCIAL_PATH(tenant), posts);
}

// --- Postgres helpers (self-contained; do not move to repositories.ts) ---
// Each query is wrapped so it never throws — a misconfigured/unreachable
// Supabase returns a safe fallback and lets the Sanity/dev path take over.

function makeSocialId(): string {
  return `social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function postToInsert(tenant: string, post: SocialPost): Insert<"social_posts"> {
  return {
    id: post.id || makeSocialId(),
    tenant_id: tenant,
    platform: post.platform,
    content: post.content,
    image_url: post.imageUrl ?? null,
    status: post.status,
    scheduled_for: post.scheduledFor ?? null,
    published_at: post.publishedAt ?? null,
    created_at: post.createdAt,
  };
}

function mapPgSocialRow(row: Row<"social_posts">): SocialPost {
  return {
    id: row.id,
    platform: row.platform as SocialPost["platform"],
    content: row.content,
    imageUrl: row.image_url ?? undefined,
    status: row.status as SocialPost["status"],
    scheduledFor: row.scheduled_for ?? undefined,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
  };
}

async function pgListSocialPosts(tenant: string): Promise<SocialPost[]> {
  try {
    const db = getSupabase();
    if (!db) return [];
    const { data, error } = await db
      .from("social_posts")
      .select("*")
      .eq("tenant_id", tenant)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapPgSocialRow);
  } catch {
    return [];
  }
}

async function pgReplaceSocialPosts(tenant: string, posts: SocialPost[]): Promise<void> {
  try {
    const db = getSupabase();
    if (!db) return;
    // Mirror the Sanity bulk-setter semantics: delete all for the tenant, recreate.
    await db.from("social_posts").delete().eq("tenant_id", tenant);
    if (posts.length === 0) return;
    const rows = posts.map((p) => postToInsert(tenant, p));
    await db.from("social_posts").insert(rows as unknown as Insert<"social_posts">[]);
  } catch {
    // Postgres write failure must not block the dual-write Sanity/dev path.
  }
}

export async function getSocialPosts(tenant: string): Promise<SocialPost[]> {
  if (dataSourceIsPostgres()) {
    const pg = await pgListSocialPosts(tenant);
    if (pg.length > 0 || !hasSanity) return pg;
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

  if (hasSanity) {
    const results = await getSanityReadClient().fetch(
      `*[_type == "socialPost" && tenant == $tenant] | order(createdAt desc) {
        "id": _id, platform, content, imageUrl, status, scheduledFor, publishedAt, createdAt
      }`,
      { tenant }
    );
    return results || [];
  }

  return readDevSocial(tenant);
}

export async function setSocialPosts(tenant: string, posts: SocialPost[]): Promise<void> {
  if (dataSourceIsPostgres()) {
    await pgReplaceSocialPosts(tenant, posts);
  }

  // For Sanity, individual CRUD is handled at the API layer.
  // This bulk setter is the dev-file fallback and a convenience for the agent tools.
  if (hasSanity) {
    // Sanity: delete all existing, recreate. Brute but correct for local-first MVP.
    const existing = await getSanityClient().fetch(
      `*[_type == "socialPost" && tenant == $tenant]._id`,
      { tenant }
    );
    for (const id of (existing || [])) {
      await getSanityClient().delete(id);
    }
    for (const post of posts) {
      await getSanityClient().create({
        _type: "socialPost",
        tenant,
        ...post,
      });
    }
    return;
  }

  if (!dataSourceIsPostgres()) {
    await writeDevSocial(tenant, posts);
  }
}
