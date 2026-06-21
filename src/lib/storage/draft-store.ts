/**
 * Draft content storage - preview versions before publishing.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres `draft_content`
 * table (Sanity fallback on read). Writes go to Postgres AND Sanity while both
 * are configured so the transition is reversible; once Sanity is removed,
 * `hasSanity` is false and only Postgres is written. Default off (Sanity path).
 */

import type { ContentSection, ContentMap } from "../types";
import { getSanityClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import {
  getDraftContentData,
  upsertDraftContentData,
  deleteDraftContentData,
  listDraftSections,
} from "../db/repositories";

export async function getDraftContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT
): Promise<ContentMap[K] | null> {
  if (dataSourceIsPostgres()) {
    const pg = await getDraftContentData(tenant, section);
    if (pg) return pg as unknown as ContentMap[K];
    // fall through to Sanity for a draft not yet in Postgres
  }

  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0].data`;
    const data = await getSanityClient().fetch(query, { tenant, section });
    return data || null;
  }

  const store = await readDevContent(tenant);
  const key = `__draft:${section}`;
  return (store[key] as ContentMap[K]) ?? null;
}

export async function setDraftContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (dataSourceIsPostgres()) {
    await upsertDraftContentData(tenant, section, data as unknown as Record<string, unknown>);
  }

  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, section });
    const doc = { _type: "draftContent" as const, tenant, section, data };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    store[`__draft:${section}`] = data;
    await writeDevContent(store, tenant);
  }
}

export async function clearDraft(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (dataSourceIsPostgres()) {
    await deleteDraftContentData(tenant, section);
  }

  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, section });
    if (existingId) {
      await getSanityClient().delete(existingId);
    }
    return;
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    delete store[`__draft:${section}`];
    await writeDevContent(store, tenant);
  }
}

export async function listDrafts(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, boolean>> {
  if (dataSourceIsPostgres()) {
    const sections = await listDraftSections(tenant);
    if (sections.length > 0) {
      const result: Record<string, boolean> = {};
      for (const s of sections) result[s] = true;
      return result;
    }
    // fall through to Sanity if Postgres has none yet
  }

  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant].section`;
    const sections: string[] = await getSanityClient().fetch(query, { tenant });
    const result: Record<string, boolean> = {};
    for (const s of sections) result[s] = true;
    return result;
  }

  const store = await readDevContent(tenant);
  const result: Record<string, boolean> = {};
  for (const key of Object.keys(store)) {
    if (key.startsWith("__draft:")) {
      result[key.replace("__draft:", "")] = true;
    }
  }
  return result;
}
