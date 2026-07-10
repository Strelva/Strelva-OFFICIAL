/**
 * Social post storage - drafts, scheduled, and published posts.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `social_posts` table;
 * otherwise the dev-file store is the source of truth.
 */

import path from "path";
import type { SocialPost } from "../types";
import { readDevFile, writeDevFile } from "./core";
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
// Supabase returns a safe fallback and lets the dev-file path take over.

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
    // Bulk-setter semantics: delete all for the tenant, recreate.
    await db.from("social_posts").delete().eq("tenant_id", tenant);
    if (posts.length === 0) return;
    const rows = posts.map((p) => postToInsert(tenant, p));
    await db.from("social_posts").insert(rows as unknown as Insert<"social_posts">[]);
  } catch {
    // Postgres write failure must not block the dev-file path.
  }
}

export async function getSocialPosts(tenant: string): Promise<SocialPost[]> {
  if (dataSourceIsPostgres()) {
    const pg = await pgListSocialPosts(tenant);
    return pg;
  }

  return readDevSocial(tenant);
}

export async function setSocialPosts(tenant: string, posts: SocialPost[]): Promise<void> {
  if (dataSourceIsPostgres()) {
    await pgReplaceSocialPosts(tenant, posts);
  }

  if (!dataSourceIsPostgres()) {
    await writeDevSocial(tenant, posts);
  }
}
