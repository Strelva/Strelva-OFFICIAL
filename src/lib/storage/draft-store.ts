/**
 * Draft content storage - preview versions before publishing.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `draft_content` table;
 * otherwise uses the local dev-file store.
 */

import type { ContentSection, ContentMap } from "../types";
import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
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
    // fall through to the dev store for a draft not yet in Postgres
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
    // fall through to the dev store if Postgres has none yet
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
