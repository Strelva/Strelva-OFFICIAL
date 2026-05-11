/**
 * Page configuration storage - per-page section ordering.
 */

import type { SitePageConfig } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";

export async function getPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "pageConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...config } = doc;
      return config.pages as SitePageConfig;
    }
    return null;
  }

  const store = await readDevContent(tenant);
  return (store.__pageConfig as SitePageConfig) ?? null;
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
  if (hasSanity) {
    const query = `*[_type == "pageConfig" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "pageConfig" as const, tenant, pages: config };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store.__pageConfig = config;
  await writeDevContent(store, tenant);
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
