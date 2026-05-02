/**
 * Weekly report storage.
 */

import path from "path";
import type { WeeklyReportData } from "../reports";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, readDevFile, writeDevFile } from "./core";

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

export async function saveWeeklyReport(
  tenant: string,
  report: WeeklyReportData
): Promise<StoredWeeklyReport> {
  const weekStart = getWeekStart();
  const stored: StoredWeeklyReport = {
    id: `report_${weekStart}_${tenant}`,
    weekStart,
    createdAt: new Date().toISOString(),
    pageViews: report.pageViews,
    bookingClicks: report.bookingClicks,
    topServices: report.topServices,
    staleSections: report.staleSections,
    summary: report.summary,
  };

  if (hasSanity) {
    // Upsert: check if report for this week exists
    const existing = await getSanityClient().fetch(
      `*[_type == "weeklyReport" && tenant == $tenant && weekStart == $weekStart][0]._id`,
      { tenant, weekStart }
    );
    if (existing) {
      await getSanityClient().patch(existing).set({
        pageViews: stored.pageViews,
        bookingClicks: stored.bookingClicks,
        topServices: stored.topServices,
        staleSections: stored.staleSections,
        summary: stored.summary,
        createdAt: stored.createdAt,
      }).commit();
    } else {
      await getSanityClient().create({
        _type: "weeklyReport",
        tenant,
        reportId: stored.id,
        weekStart: stored.weekStart,
        createdAt: stored.createdAt,
        pageViews: stored.pageViews,
        bookingClicks: stored.bookingClicks,
        topServices: stored.topServices,
        staleSections: stored.staleSections,
        summary: stored.summary,
      });
    }
    return stored;
  }

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
  return stored;
}

export async function getWeeklyReports(
  tenant: string,
  limit: number = 12
): Promise<StoredWeeklyReport[]> {
  if (hasSanity) {
    const results = await getSanityReadClient().fetch(
      `*[_type == "weeklyReport" && tenant == $tenant] | order(weekStart desc)[0...$limit] {
        "id": reportId, weekStart, createdAt, pageViews, bookingClicks, topServices, staleSections, summary
      }`,
      { tenant, limit }
    );
    return results || [];
  }

  const reports = await readDevReports(tenant);
  return reports.slice(0, limit);
}
