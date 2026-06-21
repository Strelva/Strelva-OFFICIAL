/**
 * Search Console data storage.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres
 * `search_console_data` table (one row per tenant, keyed on tenant_id;
 * Sanity fallback on read). Writes go to Postgres AND Sanity while both are
 * configured so the transition is reversible; once Sanity is removed,
 * `hasSanity` is false and only Postgres is written. Default off (Sanity path).
 */

import { promises as fs } from "fs";
import path from "path";
import type { SearchData } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

// --- Postgres repo helpers (self-contained; do NOT move to repositories.ts) ---

function searchToInsert(tenant: string, data: SearchData): Insert<"search_console_data"> {
  return {
    tenant_id: tenant,
    queries: data.queries as unknown as Insert<"search_console_data">["queries"],
    total_clicks: data.totalClicks,
    total_impressions: data.totalImpressions,
    fetched_at: data.fetchedAt,
  };
}

function mapPgSearchRow(row: Row<"search_console_data">): SearchData {
  return {
    queries: (row.queries as unknown as SearchData["queries"]) ?? [],
    totalClicks: row.total_clicks ?? 0,
    totalImpressions: row.total_impressions ?? 0,
    fetchedAt: row.fetched_at,
  };
}

async function getSearchDataPg(tenant: string): Promise<SearchData | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("search_console_data")
      .select("*")
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (error || !data) return null;
    return mapPgSearchRow(data);
  } catch {
    return null;
  }
}

async function setSearchDataPg(tenant: string, data: SearchData): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db
      .from("search_console_data")
      .upsert(searchToInsert(tenant, data), { onConflict: "tenant_id" });
  } catch {
    // never throw: dual-write must not break the Sanity/dev path
  }
}

export async function getSearchData(tenant: string): Promise<SearchData | null> {
  if (dataSourceIsPostgres()) {
    const pg = await getSearchDataPg(tenant);
    if (pg) return pg;
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "searchData" && tenant == $tenant][0]`,
      { tenant },
    );
    if (!doc) return null;
    const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...data } = doc;
    return data as SearchData;
  }

  try {
    const raw = await fs.readFile(path.join(process.cwd(), `dev-search-${tenant}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSearchData(tenant: string, data: SearchData): Promise<void> {
  if (dataSourceIsPostgres()) {
    await setSearchDataPg(tenant, data);
  }

  if (hasSanity) {
    const query = `*[_type == "searchData" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "searchData" as const, tenant, ...data };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  if (!dataSourceIsPostgres()) {
    await fs.writeFile(
      path.join(process.cwd(), `dev-search-${tenant}.json`),
      JSON.stringify(data, null, 2),
    );
  }
}
