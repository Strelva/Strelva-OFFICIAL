/**
 * Page configuration storage - per-page section ordering.
 */

import type { SitePageConfig } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import {
  getCachedPageConfig,
  invalidateCachedPageConfig,
  setCachedPageConfig,
} from "./content-cache";

export async function getPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  const cached = await getCachedPageConfig(tenant);
  if (cached !== null) return cached;

  let config: SitePageConfig | null = null;
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "pageConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...rest } = doc;
      config = rest.pages as SitePageConfig;
    }
  } else {
    const store = await readDevContent(tenant);
    config = (store.__pageConfig as SitePageConfig) ?? null;
  }

  if (config) await setCachedPageConfig(tenant, config);
  return config;
}

export async function getDraftPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "draftPageConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    return (doc?.pages as SitePageConfig) ?? null;
  }

  const store = await readDevContent(tenant);
  return (store.__draftPageConfig as SitePageConfig) ?? null;
}

export async function setPageConfig(
  config: SitePageConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  try {
    if (hasSanity) {
      const query = `*[_type == "pageConfig" && tenant == $tenant][0]._id`;
      const existingId = await getSanityClient().fetch(query, { tenant });
      const doc = { _type: "pageConfig" as const, tenant, pages: config };
      if (existingId) {
        await getSanityClient().patch(existingId).set(doc).commit();
      } else {
        await getSanityClient().create(doc);
      }
    } else {
      const store = await readDevContent(tenant);
      store.__pageConfig = config;
      await writeDevContent(store, tenant);
    }
  } catch (err) {
    await invalidateCachedPageConfig(tenant);
    throw err;
  }

  await setCachedPageConfig(tenant, config);
}

export async function setDraftPageConfig(
  config: SitePageConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "draftPageConfig" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "draftPageConfig" as const, tenant, pages: config };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store.__draftPageConfig = config;
  await writeDevContent(store, tenant);
}

export async function clearDraftPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "draftPageConfig" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    if (existingId) {
      await getSanityClient().delete(existingId);
    }
    return;
  }

  const store = await readDevContent(tenant);
  delete store.__draftPageConfig;
  await writeDevContent(store, tenant);
}
