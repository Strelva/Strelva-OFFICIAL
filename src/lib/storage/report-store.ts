/**
 * Weekly report storage.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `weekly_briefs` table;
 * otherwise the dev-file store is the source of truth.
 *
 * Postgres repo helpers are kept self-contained in this file (not in
 * repositories.ts) to avoid colliding with parallel edits there.
 */

import path from "path";
import type { WeeklyReportData } from "../reports";
import { readDevFile, writeDevFile } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

export interface StoredWeeklyReport {
  id: string;
  weekStart: string; // ISO date of the Monday
  createdAt: string;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  topServices: Array<{ serviceId: string; total: number; thisWeek: number }>;
  staleSections: Array<{ section: string; daysSinceUpdate: number }>;
  summary: string;
}

const DEV_REPORTS_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-reports-${tenant}.json`);

async function readDevReports(tenant: string): Promise<StoredWeeklyReport[]> {
  return readDevFile(DEV_REPORTS_PATH(tenant), []);
}

async function writeDevReports(tenant: string, reports: StoredWeeklyReport[]): Promise<void> {
  return writeDevFile(DEV_REPORTS_PATH(tenant), reports);
}

function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

/** Derive the Sunday week-end (week_start + 6 days) as an ISO date string. */
function getWeekEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split("T")[0];
}

/** The store id is fully derivable from weekStart + tenant, mirroring saveWeeklyReport. */
function makeReportId(weekStart: string, tenant: string): string {
  return `report_${weekStart}_${tenant}`;
}

// ---------------------------------------------------------------------------
// Postgres helpers (self-contained; never throw). The `weekly_briefs.id` column
// is a uuid with a DB default, so we do NOT store the store-style id there —
// it is reconstructed from week_start + tenant_id on read (deterministic).
// Upsert is emulated (no unique constraint on tenant_id+week_start): look up
// the existing row, patch it, else insert.
// ---------------------------------------------------------------------------

function reportToInsert(stored: StoredWeeklyReport, tenant: string): Insert<"weekly_briefs"> {
  return {
    tenant_id: tenant,
    week_start: stored.weekStart,
    week_end: getWeekEnd(stored.weekStart),
    created_at: stored.createdAt,
    page_views: stored.pageViews as unknown as Insert<"weekly_briefs">["page_views"],
    booking_clicks: stored.bookingClicks as unknown as Insert<"weekly_briefs">["booking_clicks"],
    top_services: stored.topServices as unknown as Insert<"weekly_briefs">["top_services"],
    stale_sections: stored.staleSections as unknown as Insert<"weekly_briefs">["stale_sections"],
    summary: stored.summary,
  };
}

function mapPgReportRow(row: Row<"weekly_briefs">): StoredWeeklyReport {
  return {
    id: makeReportId(row.week_start, row.tenant_id),
    weekStart: row.week_start,
    createdAt: row.created_at,
    pageViews: (row.page_views as unknown as StoredWeeklyReport["pageViews"]) ?? {
      total: 0,
      thisWeek: 0,
    },
    bookingClicks: (row.booking_clicks as unknown as StoredWeeklyReport["bookingClicks"]) ?? {
      total: 0,
      thisWeek: 0,
    },
    topServices: (row.top_services as unknown as StoredWeeklyReport["topServices"]) ?? [],
    staleSections: (row.stale_sections as unknown as StoredWeeklyReport["staleSections"]) ?? [],
    summary: row.summary ?? "",
  };
}

/** Upsert a weekly brief into Postgres by (tenant_id, week_start). Never throws. */
async function upsertReportPg(stored: StoredWeeklyReport, tenant: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    const insert = reportToInsert(stored, tenant);
    const { data: existing } = await db
      .from("weekly_briefs")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("week_start", stored.weekStart)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("weekly_briefs")
        .update({
          week_end: insert.week_end,
          created_at: insert.created_at,
          page_views: insert.page_views,
          booking_clicks: insert.booking_clicks,
          top_services: insert.top_services,
          stale_sections: insert.stale_sections,
          summary: insert.summary,
        })
        .eq("id", existing.id);
    } else {
      await db.from("weekly_briefs").insert(insert);
    }
  } catch {
    // never block on the migration path
  }
}

/** List weekly briefs for a tenant, newest first. Returns [] on any failure. */
async function listReportsPg(tenant: string, limit: number): Promise<StoredWeeklyReport[]> {
  const db = getSupabase();
  if (!db) return [];
  try {
    const { data } = await db
      .from("weekly_briefs")
      .select("*")
      .eq("tenant_id", tenant)
      .order("week_start", { ascending: false })
      .limit(limit);
    return (data ?? []).map(mapPgReportRow);
  } catch {
    return [];
  }
}

export async function saveWeeklyReport(
  tenant: string,
  report: WeeklyReportData
): Promise<StoredWeeklyReport> {
  const weekStart = getWeekStart();
  const stored: StoredWeeklyReport = {
    id: makeReportId(weekStart, tenant),
    weekStart,
    createdAt: new Date().toISOString(),
    pageViews: report.pageViews,
    bookingClicks: report.bookingClicks,
    topServices: report.topServices,
    staleSections: report.staleSections,
    summary: report.summary,
  };

  if (dataSourceIsPostgres()) {
    await upsertReportPg(stored, tenant);
  }

  if (!dataSourceIsPostgres()) {
    // Dev file: upsert by weekStart
    const reports = await readDevReports(tenant);
    const idx = reports.findIndex((r) => r.weekStart === weekStart);
    if (idx >= 0) {
      reports[idx] = stored;
    } else {
      reports.unshift(stored);
    }
    // Keep last 52 weeks
    await writeDevReports(tenant, reports.slice(0, 52));
  }
  return stored;
}

export async function getWeeklyReports(
  tenant: string,
  limit: number = 12
): Promise<StoredWeeklyReport[]> {
  if (dataSourceIsPostgres()) {
    const rows = await listReportsPg(tenant, limit);
    return rows;
  }

  const reports = await readDevReports(tenant);
  return reports.slice(0, limit);
}
