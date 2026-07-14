/**
 * Search Console data storage.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `search_console_data`
 * table (one row per tenant, keyed on tenant_id); otherwise the dev-file store
 * is the source of truth.
 */

import { promises as fs } from "fs";
import path from "path";
import type { SearchData } from "../types";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

// --- Postgres repo helpers (self-contained; do NOT move to repositories.ts) ---

function searchDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[search] ${operation} failed: Supabase is not configured`);
  return db;
}

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
  const db = searchDb(`read ${tenant}`);
  const { data, error } = await db
    .from("search_console_data")
    .select("*")
    .eq("tenant_id", tenant)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPgSearchRow(data) : null;
}

async function setSearchDataPg(tenant: string, data: SearchData): Promise<void> {
  const db = searchDb(`write ${tenant}`);
  const { error } = await db
    .from("search_console_data")
    .upsert(searchToInsert(tenant, data), { onConflict: "tenant_id" });
  if (error) throw error;
}

export async function getSearchData(tenant: string): Promise<SearchData | null> {
  if (dataSourceIsPostgres()) {
    return getSearchDataPg(tenant);
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

  if (!dataSourceIsPostgres()) {
    await fs.writeFile(
      path.join(process.cwd(), `dev-search-${tenant}.json`),
      JSON.stringify(data, null, 2),
    );
  }
}
