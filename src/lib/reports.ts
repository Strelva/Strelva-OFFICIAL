import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getAllTenants, getTenantConfig } from "./tenants";
import { getClickCounts, getClickCountsByPrefix, getActivity, getSectionTimestamps, getContent, getSearchData } from "./storage";
import { getEvents } from "./events";
import { STALE_DAYS } from "./utils";
import type { TenantConfig, ContentSection, SearchQuery, UnifiedEvent } from "./types";
import type { ActivityEntry } from "./storage";
import { getLatestSnapshots, diffSnapshots } from "./visibility/snapshots";
import type { VisibilityDiff } from "./visibility/snapshots";

export interface ServiceClickData {
  serviceId: string;
  total: number;
  thisWeek: number;
}

export interface VerifiedChangeItem {
  /** Human-readable section label, e.g. "Hours" */
  section: string;
  /** When the content write happened (ISO string from the event createdAt). */
  writtenAt: string;
  /** When verification confirmed the change was live (ISO string). */
  verifiedAt: string;
}

export interface WeeklyReportData {
  tenant: TenantConfig;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  topServices: ServiceClickData[];
  topSearchQueries: SearchQuery[];
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: ActivityEntry[];
  /** Verified-live items this week. */
  verifiedChanges: VerifiedChangeItem[];
  /** Count of change_verify_failed events this week. */
  failedVerifications: number;
  /** Plain-English visibility position changes, or empty string when no signal. */
  visibilityLines: string;
  summary: string;
}

/**
 * Build plain-English verification lines for a report.
 * NEVER claims verified when it isn't — only renders if verifiedChanges is
 * non-empty; always renders a discrete honest line for failures.
 */
export function formatVerificationLines(
  verifiedChanges: VerifiedChangeItem[],
  failedVerifications: number
): string {
  const lines: string[] = [];

  for (const item of verifiedChanges) {
    const writtenLabel = formatDay(item.writtenAt);
    const verifiedLabel = formatDayTime(item.verifiedAt);
    lines.push(`${capitalise(item.section)} updated ${writtenLabel} — checked live ${verifiedLabel}.`);
  }

  if (failedVerifications > 0) {
    const plural = failedVerifications === 1 ? "change" : "changes";
    lines.push(
      `${failedVerifications} ${plural} could not be confirmed live — we're on it.`
    );
  }

  return lines.join("\n");
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
  } catch {
    return iso;
  }
}

function formatDayTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString("en-US", { weekday: "long" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} ${time}`;
  } catch {
    return iso;
  }
}

/**
 * Extract verified-change items and failed-verification count from a list of
 * events. Scoped to a given week range so the report only shows this period.
 */
export function extractVerificationData(
  events: UnifiedEvent[],
  weekStart: Date,
  weekEnd: Date
): { verifiedChanges: VerifiedChangeItem[]; failedVerifications: number } {
  const inWindow = (iso: string) => {
    const d = new Date(iso);
    return d >= weekStart && d <= weekEnd;
  };

  const verifiedChanges: VerifiedChangeItem[] = [];
  let failedVerifications = 0;

  for (const ev of events) {
    if (!inWindow(ev.createdAt)) continue;

    if (ev.type === "change_verified") {
      const section = (ev.metadata?.section as string) || ev.title.split(" ")[0] || "content";
      const verifiedAt = (ev.metadata?.checkedAt as string) || ev.createdAt;
      verifiedChanges.push({ section, writtenAt: ev.createdAt, verifiedAt });
    } else if (ev.type === "change_verify_failed") {
      failedVerifications += 1;
    }
  }

  return { verifiedChanges, failedVerifications };
}

/**
 * Extract a VisibilityDiff for the current tenant by loading its two most
 * recent visibility_snapshot events. Returns null when there are no snapshots.
 * Errors are swallowed so one bad tenant never blocks report generation.
 */
export async function extractVisibilityDiff(tenantId: string): Promise<VisibilityDiff | null> {
  try {
    const snapshots = await getLatestSnapshots(tenantId, 2);
    if (snapshots.length === 0) return null;
    const current = snapshots[0];
    const previous = snapshots[1] ?? null;
    return diffSnapshots(previous, current);
  } catch {
    return null;
  }
}

/**
 * Format a plain-English visibility section for the weekly report.
 * Returns an empty string when there is no signal — never invented copy.
 *
 * Only renders when:
 *   - a position moved (improved or declined)
 *   - a business appeared or disappeared from a surface
 * Skipped checks are never rendered as negative absence-of-competitor claims.
 */
export function formatVisibilityLines(diff: VisibilityDiff | null): string {
  if (!diff || !diff.hasSignal) return "";

  const lines: string[] = [];

  for (const change of diff.changes) {
    const { query, surface, before, after, direction } = change;

    if (surface === "serp_organic") {
      if (direction === "improved" && typeof before === "number" && typeof after === "number") {
        lines.push(`You moved from #${before} to #${after} for "${query}" in Google search.`);
      } else if (direction === "declined" && typeof before === "number" && typeof after === "number") {
        lines.push(`Your Google ranking for "${query}" dropped from #${before} to #${after}.`);
      } else if (direction === "appeared") {
        lines.push(`You now appear in Google results for "${query}" (#${after}).`);
      } else if (direction === "disappeared") {
        lines.push(`You dropped out of Google results for "${query}" (were #${before}).`);
      }
    } else if (surface === "serp_local_pack") {
      if (direction === "appeared") {
        lines.push(`You appeared in the Google local pack for "${query}".`);
      } else if (direction === "disappeared") {
        lines.push(`You dropped out of the Google local pack for "${query}".`);
      }
    } else if (surface === "ai_answer") {
      if (direction === "appeared") {
        lines.push(`AI started recommending you for "${query}" — a win worth keeping.`);
      } else if (direction === "disappeared") {
        lines.push(`AI stopped mentioning you for "${query}" — checked via one model, directional only.`);
      }
    }
  }

  return lines.join("\n");
}

export function detectStaleSections(
  timestamps: Record<string, string>,
  sections: string[],
): { section: string; daysSinceUpdate: number }[] {
  const now = Date.now();
  const stale: { section: string; daysSinceUpdate: number }[] = [];

  for (const section of sections) {
    const ts = timestamps[section];
    if (!ts) continue;
    const days = Math.floor((now - new Date(ts).getTime()) / 86_400_000);
    if (days >= STALE_DAYS) {
      stale.push({ section, daysSinceUpdate: days });
    }
  }

  return stale.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

interface ReportSummaryInput {
  siteName: string;
  ownerName: string;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  topServices: ServiceClickData[];
  topSearchQueries: SearchQuery[];
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: ActivityEntry[];
  serviceNames: Record<string, string>;
  verifiedChanges: VerifiedChangeItem[];
  failedVerifications: number;
  visibilityLines: string;
}

/**
 * Deterministic plain-English email body used when the Gemini call fails or
 * is unavailable. Claims-safe per AGENTS.md customer language: reports visits
 * and clicks, never "leads". Mirrors buildFallbackSummary in weekly-brief.ts
 * but in the multi-paragraph tone of the email "receipt".
 */
export function buildReportFallbackSummary(data: ReportSummaryInput): string {
  const paragraphs: string[] = [];

  const greeting = data.ownerName ? `Hi ${data.ownerName},` : "Hi,";

  if (data.pageViews.thisWeek > 0) {
    const plural = data.pageViews.thisWeek === 1 ? "person" : "people";
    paragraphs.push(
      `${greeting} ${data.pageViews.thisWeek} ${plural} found you this week (${data.pageViews.total} total so far).`,
    );
  } else {
    paragraphs.push(
      `${greeting} no new visits landed this week — a good moment to share your site or freshen up a section.`,
    );
  }

  if (data.bookingClicks.thisWeek > 0) {
    const plural = data.bookingClicks.thisWeek === 1 ? "click" : "clicks";
    paragraphs.push(
      `${data.bookingClicks.thisWeek} booking ${plural} came through this week (${data.bookingClicks.total} total).`,
    );
  }

  const topService = data.topServices.find((s) => s.thisWeek > 0);
  if (topService) {
    const name = data.serviceNames[topService.serviceId] || topService.serviceId;
    const plural = topService.thisWeek === 1 ? "click" : "clicks";
    paragraphs.push(`"${name}" drew the most interest with ${topService.thisWeek} booking ${plural}.`);
  }

  const topQuery = data.topSearchQueries[0];
  if (topQuery) {
    paragraphs.push(`People searched "${topQuery.query}" to find you.`);
  }

  const stalest = data.staleSections[0];
  if (stalest) {
    paragraphs.push(
      `Your ${stalest.section} section hasn't changed in ${stalest.daysSinceUpdate} days — a quick update keeps things fresh.`,
    );
  }

  const verificationLines = formatVerificationLines(
    data.verifiedChanges,
    data.failedVerifications
  );
  if (verificationLines) {
    paragraphs.push(verificationLines);
  }

  if (data.visibilityLines) {
    paragraphs.push(data.visibilityLines);
  }

  return paragraphs.join("\n\n");
}

async function generateReportSummary(data: ReportSummaryInput): Promise<string> {
  const activitySummary = data.recentActivity
    .slice(0, 10)
    .map((a) => `- ${a.text}`)
    .join("\n");

  const staleSummary = data.staleSections
    .map((s) => `- ${s.section} (${s.daysSinceUpdate} days)`)
    .join("\n");

  const serviceSummary = data.topServices
    .map((s) => `- ${data.serviceNames[s.serviceId] || s.serviceId}: ${s.thisWeek} clicks this week (${s.total} total)`)
    .join("\n");

  const verificationBlock = data.verifiedChanges.length > 0 || data.failedVerifications > 0
    ? `\nVerified site changes this week:\n${formatVerificationLines(data.verifiedChanges, data.failedVerifications)}`
    : "";

  const visibilityBlock = data.visibilityLines
    ? `\nVisibility changes this week (Google + AI, directional only):\n${data.visibilityLines}`
    : "";

  let text: string;
  try {
    ({ text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `Write a short, warm weekly report email for ${data.ownerName} about their business website "${data.siteName}".

Stats this week:
- ${data.pageViews.thisWeek} people found the site (${data.pageViews.total} total)
- ${data.bookingClicks.thisWeek} booking clicks (${data.bookingClicks.total} total)

${serviceSummary ? `Top services by booking clicks:\n${serviceSummary}` : ""}

${data.topSearchQueries.length > 0 ? `Top searches that found the site:\n${data.topSearchQueries.map((q) => `- "${q.query}" (${q.clicks} clicks, ${q.impressions} impressions)`).join("\n")}` : ""}

${staleSummary ? `Sections that haven't been updated in a while:\n${staleSummary}` : "All sections are up to date."}

${activitySummary ? `Recent site activity:\n${activitySummary}` : "No recent activity."}
${verificationBlock}${visibilityBlock}
Rules:
- 3-5 short paragraphs max
- Lead with the most interesting metric
- If search query data is available, mention what people are searching to find the site — use their exact words
- If per-service data is available, mention the most popular service by name
- If sections are stale, suggest updating one specific section with a concrete idea
- If verified site changes are listed, include them with their timestamps — these are proof of work, use the exact phrasing provided
- If a change could not be confirmed live, include that honest line verbatim
- If visibility changes are listed, include them as-is — these are position moves in Google or AI, use the exact phrasing provided
- Use "you" not "your site" — make it personal
- Sound like a helpful coworker texting an update, not a marketing email
- No subject line, no greeting, no sign-off — just the body
- Plain text, no markdown or HTML formatting`,
    }));
  } catch (err) {
    console.error(
      `[reports] Gemini summary failed for "${data.siteName}", using deterministic fallback:`,
      err,
    );
    return buildReportFallbackSummary(data);
  }

  const trimmed = text.trim();
  return trimmed || buildReportFallbackSummary(data);
}

export async function generateWeeklyReport(
  tenantId: string,
): Promise<WeeklyReportData | null> {
  const tenant = await getTenantConfig(tenantId);
  if (!tenant || !tenant.active) return null;

  const contentSections: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];

  const [pageViews, bookingClicks, timestamps, activity, settings, services, perServiceClicks, searchData, events] =
    await Promise.all([
      getClickCounts("page-view", tenantId),
      getClickCounts("booking-click", tenantId),
      getSectionTimestamps(tenantId),
      getActivity(tenantId),
      getContent("settings", tenantId),
      getContent("services", tenantId),
      getClickCountsByPrefix("booking-click:", tenantId),
      getSearchData(tenantId),
      getEvents(tenantId, { limit: 200 }),
    ]);

  const staleSections = detectStaleSections(
    timestamps,
    contentSections,
  );

  // Build service ID -> name lookup
  const serviceNames: Record<string, string> = {};
  for (const s of services.services) {
    serviceNames[s.id] = s.name;
  }

  // Top 3 services by this week's clicks
  const topServices: ServiceClickData[] = Object.entries(perServiceClicks)
    .map(([event, counts]) => ({
      serviceId: event.replace("booking-click:", ""),
      total: counts.total,
      thisWeek: counts.thisWeek,
    }))
    .sort((a, b) => b.thisWeek - a.thisWeek)
    .slice(0, 3);

  const topSearchQueries = (searchData?.queries || []).slice(0, 5);

  // Extract verification data for the current week (Mon–Sun).
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const { verifiedChanges, failedVerifications } = extractVerificationData(
    events,
    weekStart,
    weekEnd
  );

  const visibilityDiff = await extractVisibilityDiff(tenantId);
  const visibilityLines = formatVisibilityLines(visibilityDiff);

  const summary = await generateReportSummary({
    siteName: settings.siteName || tenant.siteName,
    ownerName: tenant.ownerName,
    pageViews,
    bookingClicks,
    topServices,
    topSearchQueries,
    staleSections,
    recentActivity: activity,
    serviceNames,
    verifiedChanges,
    failedVerifications,
    visibilityLines,
  });

  return {
    tenant,
    pageViews,
    bookingClicks,
    topServices,
    topSearchQueries,
    staleSections,
    recentActivity: activity,
    verifiedChanges,
    failedVerifications,
    visibilityLines,
    summary,
  };
}

export interface ReportSkip {
  tenantId: string;
  reason: "missing_owner_email" | "inactive" | "no_report" | "generation_failed";
  detail?: string;
}

export interface GenerateAllReportsResult {
  reports: WeeklyReportData[];
  skipped: ReportSkip[];
}

/**
 * Generates a report per active tenant with per-tenant isolation: one tenant's
 * failure (e.g. a Gemini or Redis error) never blocks the others. Tenants that
 * were skipped — including those missing an owner email — are returned with a
 * reason so callers can answer "why did X never get a receipt?".
 */
export async function generateAllReports(): Promise<GenerateAllReportsResult> {
  const tenants = await getAllTenants();
  const reports: WeeklyReportData[] = [];
  const skipped: ReportSkip[] = [];

  for (const tenant of tenants) {
    if (!tenant.active) {
      skipped.push({ tenantId: tenant.id, reason: "inactive" });
      continue;
    }
    if (!tenant.ownerEmail) {
      skipped.push({ tenantId: tenant.id, reason: "missing_owner_email" });
      continue;
    }

    try {
      const report = await generateWeeklyReport(tenant.id);
      if (report) {
        reports.push(report);
      } else {
        skipped.push({ tenantId: tenant.id, reason: "no_report" });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      console.error(`[reports] Report generation failed for tenant ${tenant.id}:`, err);
      skipped.push({ tenantId: tenant.id, reason: "generation_failed", detail });
    }
  }

  return { reports, skipped };
}
