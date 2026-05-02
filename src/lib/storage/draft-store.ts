/**
 * Draft content storage - preview versions before publishing.
 */

import type { ContentSection, ContentMap } from "../types";
import { getSanityClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";

export async function getDraftContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT
): Promise<ContentMap[K] | null> {
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

  const store = await readDevContent(tenant);
  store[`__draft:${section}`] = data;
  await writeDevContent(store, tenant);
}

export async function clearDraft(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, section });
    if (existingId) {
      await getSanityClient().delete(existingId);
    }
    return;
  }

  const store = await readDevContent(tenant);
  delete store[`__draft:${section}`];
  await writeDevContent(store, tenant);
}

export async function listDrafts(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, boolean>> {
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
