/**
 * Public blog read path, backed by the Collections CMS (Postgres
 * `collection_entries`, the `blog` type) — the SAME store the dashboard CMS
 * editor and the AI agent write to. Replaces the old `src/lib/blog.ts` Sanity
 * path so there is one blog store end to end (write + read).
 */
import { listEntriesForType, getEntry } from "./collections-service";
import type { Row } from "../db/client";

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Body content; the public detail page splits this on blank lines. */
  content: string;
  author: string;
  tags: string[];
  publishedAt: string;
}

function toPost(row: Row<"collection_entries">): PublicBlogPost {
  const d = (row.data ?? {}) as {
    title?: string;
    excerpt?: string;
    body?: string;
    author?: string;
    tags?: string[];
  };
  return {
    id: row.id,
    slug: row.slug,
    title: d.title ?? "",
    excerpt: d.excerpt ?? "",
    content: d.body ?? "",
    author: d.author ?? "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    // collection_entries has no published_at; created_at is the publish moment.
    publishedAt: row.created_at,
  };
}

/** Published blog posts for a tenant's public site (pass status undefined for
 *  preview to include drafts). Newest first via the repository's ordering. */
export async function getBlogPostsForSite(
  tenant: string,
  opts?: { status?: "draft" | "published"; limit?: number }
): Promise<PublicBlogPost[]> {
  const rows = await listEntriesForType(tenant, "blog", opts);
  return rows.map(toPost);
}

/** A single post by slug. Drafts return null unless `includeDrafts` is set. */
export async function getBlogPostForSite(
  tenant: string,
  slug: string,
  opts?: { includeDrafts?: boolean }
): Promise<PublicBlogPost | null> {
  const row = await getEntry(tenant, "blog", slug);
  if (!row) return null;
  if (!opts?.includeDrafts && row.status !== "published") return null;
  return toPost(row);
}
