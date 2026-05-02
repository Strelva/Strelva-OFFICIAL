/**
 * Social post storage - drafts, scheduled, and published posts.
 */

import path from "path";
import type { SocialPost } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, readDevFile, writeDevFile } from "./core";

const DEV_SOCIAL_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-social-${tenant}.json`);

async function readDevSocial(tenant: string): Promise<SocialPost[]> {
  return readDevFile(DEV_SOCIAL_PATH(tenant), []);
}

async function writeDevSocial(tenant: string, posts: SocialPost[]): Promise<void> {
  return writeDevFile(DEV_SOCIAL_PATH(tenant), posts);
}

export async function getSocialPosts(tenant: string): Promise<SocialPost[]> {
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

  await writeDevSocial(tenant, posts);
}
