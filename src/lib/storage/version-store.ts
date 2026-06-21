/**
 * Content versioning - track changes and enable rollback.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres
 * `content_versions` table (Sanity fallback on read). Writes go to Postgres AND
 * Sanity while both are configured so the transition is reversible; once Sanity
 * is removed, `hasSanity` is false and only Postgres is written. Default off
 * (Sanity path). The Postgres repo helpers are kept self-contained in this file
 * (never throw — safe fallback) to avoid colliding with parallel edits to
 * repositories.ts.
 */

import type { ContentSection, ContentMap } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { setContent } from "./content-store";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

export interface ContentVersion {
  id: string;
  section: string;
  data: unknown;
  author: "user" | "ai" | "admin";
  timestamp: string;
  status: "live" | "rolled-back";
  changes?: { field: string; before: string; after: string }[];
}

// --- Postgres repo helpers (self-contained; never throw) -------------------

function versionToInsert(v: ContentVersion, tenant: string): Insert<"content_versions"> {
  return {
    id: v.id,
    tenant_id: tenant,
    section: v.section,
    data: v.data as Insert<"content_versions">["data"],
    author: v.author,
    created_at: v.timestamp,
    status: v.status,
    changes: (v.changes ?? null) as Insert<"content_versions">["changes"],
  };
}

function mapPgVersionRow(row: Row<"content_versions">): ContentVersion {
  return {
    id: row.id,
    section: row.section,
    data: row.data as unknown,
    author: row.author as ContentVersion["author"],
    timestamp: row.created_at,
    status: row.status as ContentVersion["status"],
    changes: (row.changes as ContentVersion["changes"]) ?? undefined,
  };
}

async function pgInsertVersion(v: ContentVersion, tenant: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db.from("content_versions").insert(versionToInsert(v, tenant));
  } catch {
    // never block the write path on a Postgres failure
  }
}

async function pgListVersions(
  section: string,
  tenant: string,
  limit = 50
): Promise<ContentVersion[]> {
  const db = getSupabase();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("content_versions")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("section", section)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapPgVersionRow);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------

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

  if (dataSourceIsPostgres()) {
    await pgInsertVersion(version, tenant);
  }

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

  if (!dataSourceIsPostgres()) {
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
  }
  return version;
}

export async function getVersions(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<ContentVersion[]> {
  if (dataSourceIsPostgres()) {
    const rows = await pgListVersions(section, tenant, 50);
    if (rows.length > 0 || !hasSanity) return rows;
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

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
