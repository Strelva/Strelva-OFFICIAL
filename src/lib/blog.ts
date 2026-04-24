import { promises as fs } from "fs";
import path from "path";
import type { BlogPost } from "./types";
import { getSanityClient, getSanityReadClient } from "./sanity";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

function devBlogPath(tenant: string): string {
  return path.join(process.cwd(), `dev-blog-${tenant}.json`);
}

async function readDevBlog(tenant: string): Promise<BlogPost[]> {
  try {
    const raw = await fs.readFile(devBlogPath(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeDevBlog(tenant: string, posts: BlogPost[]): Promise<void> {
  await fs.writeFile(devBlogPath(tenant), JSON.stringify(posts, null, 2));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateId(): string {
  return `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getBlogPosts(
  tenant: string,
  options?: { status?: string; limit?: number }
): Promise<BlogPost[]> {
  if (hasSanity) {
    let query = `*[_type == "blogPost" && tenant == $tenant`;
    const params: Record<string, string | number> = { tenant };
    if (options?.status) {
      query += ` && status == $status`;
      params.status = options.status;
    }
    query += `] | order(publishedAt desc)`;
    if (options?.limit) {
      query += `[0...${options.limit}]`;
    }
    query += `{ "id": _id, slug, title, excerpt, content, author, publishedAt, status, tags }`;
    return getSanityReadClient().fetch(query, params);
  }

  let posts = await readDevBlog(tenant);
  if (options?.status) {
    posts = posts.filter((p) => p.status === options.status);
  }
  posts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  if (options?.limit) {
    posts = posts.slice(0, options.limit);
  }
  return posts;
}

export async function getBlogPost(
  tenant: string,
  slug: string,
  options?: { includeDrafts?: boolean }
): Promise<BlogPost | null> {
  if (hasSanity) {
    // In preview/draft mode, allow fetching any post regardless of status
    // In production, only fetch published posts
    let query = `*[_type == "blogPost" && tenant == $tenant && slug == $slug`;
    if (!options?.includeDrafts) {
      query += ` && status == "published"`;
    }
    query += `][0]{ "id": _id, slug, title, excerpt, content, author, publishedAt, status, tags }`;
    const doc = await getSanityReadClient().fetch(query, { tenant, slug });
    return doc || null;
  }

  const posts = await readDevBlog(tenant);
  const post = posts.find((p) => p.slug === slug);
  if (!post) return null;
  // In production mode (no includeDrafts), only return published posts
  if (!options?.includeDrafts && post.status !== "published") return null;
  return post;
}

export async function createBlogPost(
  tenant: string,
  post: Omit<BlogPost, "id" | "publishedAt">
): Promise<BlogPost> {
  const id = generateId();
  const publishedAt = new Date().toISOString();
  const slug = post.slug || slugify(post.title);

  const newPost: BlogPost = { ...post, id, slug, publishedAt };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "blogPost",
      tenant,
      slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      author: post.author,
      publishedAt,
      status: post.status,
      tags: post.tags,
    });
    return newPost;
  }

  const posts = await readDevBlog(tenant);
  posts.push(newPost);
  await writeDevBlog(tenant, posts);
  return newPost;
}

export async function updateBlogPost(
  tenant: string,
  slug: string,
  updates: Partial<BlogPost>
): Promise<BlogPost | null> {
  if (hasSanity) {
    const query = `*[_type == "blogPost" && tenant == $tenant && slug == $slug][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, slug });
    if (!existingId) return null;

    const { id: _id, ...sanityUpdates } = updates;
    await getSanityClient().patch(existingId).set(sanityUpdates).commit();

    const updated = await getBlogPost(tenant, updates.slug || slug);
    return updated;
  }

  const posts = await readDevBlog(tenant);
  const idx = posts.findIndex((p) => p.slug === slug);
  if (idx === -1) return null;

  posts[idx] = { ...posts[idx], ...updates };
  await writeDevBlog(tenant, posts);
  return posts[idx];
}
