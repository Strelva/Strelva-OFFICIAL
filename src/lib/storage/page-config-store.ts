/**
 * Page configuration storage - per-page section ordering.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres `page_config`
 * and `draft_page_config` tables (Sanity fallback on read). Writes go to Postgres
 * AND Sanity while both are configured so the transition is reversible; once
 * Sanity is removed, `hasSanity` is false and only Postgres is written. Default
 * off (Sanity path).
 *
 * Shape note: the store models one `SitePageConfig` blob per tenant
 * (`Record<pageName, { sections, seo }>`). The Postgres tables model ONE ROW PER
 * (tenant_id, page_name) with `sections` (jsonb) + `seo` (jsonb). The repo
 * helpers below fan the blob out into per-page rows on write and reassemble the
 * blob from the tenant's rows on read, so the store's public signatures and
 * shape are preserved exactly.
 */

import type { SitePageConfig, PageConfig } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase } from "../db/client";
import type { Row, Insert } from "../db/client";
import {
  getCachedPageConfig,
  invalidateCachedPageConfig,
  setCachedPageConfig,
} from "./content-cache";

// --- Self-contained Postgres repo helpers (kept in this file to avoid colliding
//     with parallel edits to repositories.ts). Each wrapped so it never throws. ---

type PageConfigTable = "page_config" | "draft_page_config";

/** Map a `SitePageConfig` blob into per-page insert rows for the given table. */
function blobToRows(
  table: PageConfigTable,
  tenant: string,
  config: SitePageConfig
): Insert<PageConfigTable>[] {
  return Object.entries(config).map(([pageName, page]) => ({
    tenant_id: tenant,
    page_name: pageName,
    sections: (page.sections ?? []) as unknown as Insert<PageConfigTable>["sections"],
    seo: (page.seo ?? null) as unknown as Insert<PageConfigTable>["seo"],
  }));
}

/** Reassemble a `SitePageConfig` blob from a tenant's per-page rows. */
function rowsToBlob(rows: Row<PageConfigTable>[]): SitePageConfig | null {
  if (rows.length === 0) return null;
  const config: SitePageConfig = {};
  for (const row of rows) {
    config[row.page_name] = {
      sections: (row.sections ?? []) as unknown as PageConfig["sections"],
      seo: (row.seo as unknown as PageConfig["seo"]) ?? undefined,
    };
  }
  return config;
}

/** Read all per-page rows for a tenant and reassemble into a blob. Safe. */
async function getPgPageConfig(
  table: PageConfigTable,
  tenant: string
): Promise<SitePageConfig | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("tenant_id", tenant);
    if (error || !data) return null;
    return rowsToBlob(data as Row<PageConfigTable>[]);
  } catch {
    return null;
  }
}

/** Replace a tenant's per-page rows with the given blob (delete-then-insert). Safe. */
async function setPgPageConfig(
  table: PageConfigTable,
  tenant: string,
  config: SitePageConfig
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db.from(table).delete().eq("tenant_id", tenant);
    const rows = blobToRows(table, tenant, config);
    if (rows.length > 0) {
      await db.from(table).insert(rows);
    }
  } catch {
    // never throw — Sanity/dev path remains the durable fallback
  }
}

/** Delete all of a tenant's per-page rows for the given table. Safe. */
async function clearPgPageConfig(
  table: PageConfigTable,
  tenant: string
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db.from(table).delete().eq("tenant_id", tenant);
  } catch {
    // never throw
  }
}

export async function getPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  const cached = await getCachedPageConfig(tenant);
  if (cached !== null) return cached;

  let config: SitePageConfig | null = null;

  if (dataSourceIsPostgres()) {
    config = await getPgPageConfig("page_config", tenant);
    // fall through to Sanity/dev for a tenant not yet in Postgres
  }

  if (config === null) {
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
  }

  if (config) await setCachedPageConfig(tenant, config);
  return config;
}

export async function getDraftPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  if (dataSourceIsPostgres()) {
    const pg = await getPgPageConfig("draft_page_config", tenant);
    if (pg) return pg;
    // fall through to Sanity/dev for a draft not yet in Postgres
  }

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
    if (dataSourceIsPostgres()) {
      await setPgPageConfig("page_config", tenant, config);
    }

    if (hasSanity) {
      const query = `*[_type == "pageConfig" && tenant == $tenant][0]._id`;
      const existingId = await getSanityClient().fetch(query, { tenant });
      const doc = { _type: "pageConfig" as const, tenant, pages: config };
      if (existingId) {
        await getSanityClient().patch(existingId).set(doc).commit();
      } else {
        await getSanityClient().create(doc);
      }
    } else if (!dataSourceIsPostgres()) {
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
  if (dataSourceIsPostgres()) {
    await setPgPageConfig("draft_page_config", tenant, config);
  }

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

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    store.__draftPageConfig = config;
    await writeDevContent(store, tenant);
  }
}

export async function clearDraftPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (dataSourceIsPostgres()) {
    await clearPgPageConfig("draft_page_config", tenant);
  }

  if (hasSanity) {
    const query = `*[_type == "draftPageConfig" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    if (existingId) {
      await getSanityClient().delete(existingId);
    }
    return;
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    delete store.__draftPageConfig;
    await writeDevContent(store, tenant);
  }
}
