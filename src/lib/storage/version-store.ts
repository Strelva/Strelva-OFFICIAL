/**
 * Content versioning - track changes and enable rollback.
 */

import type { ContentSection, ContentMap } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { setContent } from "./content-store";

export interface ContentVersion {
  id: string;
  section: string;
  data: unknown;
  author: "user" | "ai" | "admin";
  timestamp: string;
  status: "live" | "rolled-back";
  changes?: { field: string; before: string; after: string }[];
}

export async function appendVersion(
  section: ContentSection,
  data: unknown,
  author: "user" | "ai" | "admin",
  tenant: string = DEFAULT_TENANT,
  changes?: { field: string; before: string; after: string }[]
): Promise<ContentVersion> {
  const version: ContentVersion = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    section,
    data,
    author,
    timestamp: new Date().toISOString(),
    status: "live",
    changes,
  };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "contentVersion",
      tenant,
      versionId: version.id,
      section: version.section,
      data: JSON.stringify(version.data),
      author: version.author,
      time: version.timestamp,
      status: version.status,
      changes: version.changes,
    });
    return version;
  }

  const store = await readDevContent(tenant);
  const key = `__versions:${section}`;
  const versions = (store[key] as ContentVersion[]) ?? [];
  // Mark all previous live versions as rolled-back
  for (const v of versions) {
    if (v.status === "live") v.status = "rolled-back";
  }
  versions.unshift(version);
  store[key] = versions.slice(0, 50); // keep last 50 versions per section
  await writeDevContent(store, tenant);
  return version;
}

export async function getVersions(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<ContentVersion[]> {
  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<
      Array<{
        versionId: string;
        section: string;
        data: string;
        author: string;
        time: string;
        status: string;
        changes?: ContentVersion["changes"];
      }>
    >(
      `*[_type == "contentVersion" && tenant == $tenant && section == $section] | order(time desc)[0...50]{
        versionId, section, data, author, time, status, changes
      }`,
      { tenant, section }
    );
    return raw.map((v) => ({
      id: v.versionId,
      section: v.section,
      data: typeof v.data === "string" ? JSON.parse(v.data) : v.data,
      author: v.author as "user" | "ai" | "admin",
      timestamp: v.time,
      status: v.status as "live" | "rolled-back",
      changes: v.changes,
    }));
  }

  const store = await readDevContent(tenant);
  const key = `__versions:${section}`;
  return (store[key] as ContentVersion[]) ?? [];
}

export async function restoreVersion(
  section: ContentSection,
  versionId: string,
  tenant: string = DEFAULT_TENANT,
  author: "user" | "ai" | "admin" = "user"
): Promise<ContentVersion | null> {
  const versions = await getVersions(section, tenant);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return null;

  // Write the restored content as live
  await setContent(section, target.data as ContentMap[ContentSection], tenant);

  // Create a new version marking this as a restore
  const restored = await appendVersion(section, target.data, author, tenant, [
    { field: "_restore", before: "", after: `Restored from ${versionId}` },
  ]);

  return restored;
}
