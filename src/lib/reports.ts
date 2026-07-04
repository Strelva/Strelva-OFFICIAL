import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getAllTenants, getTenantConfig } from "./tenants";
import { getClickCounts, getClickCountsByPrefix, getActivity, getSectionTimestamps, getContent, getSearchData, getDailyMetrics } from "./storage";
import { getEvents } from "./events";
import { detectTrafficAnomaly } from "./anomaly";
import type { TrafficAnomaly } from "./anomaly";
import { STALE_DAYS } from "./utils";
import type { TenantConfig, ContentSection, SearchQuery, UnifiedEvent } from "./types";
import type { ActivityEntry } from "./storage";
import { getLatestSnapshots, diffSnapshots } from "./visibility/snapshots";
import type { VisibilityDiff } from "./visibility/snapshots";
import { sanitizeEmailSubjectText } from "./invite-email";
import { getSearchConsolePerf, getGa4Perf } from "./analytics";
import type { SearchPerf, GaPerf } from "./analytics";
import type { EmailRow } from "./email/layout";

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
  /**
   * Compact Search Console + GA4 highlights as email label/value rows — only the
   * surfaces whose live read came back "ok". Empty when nothing is connected
   * (the common case), so the report simply omits the Search & Analytics block.
   */
  analyticsRows: EmailRow[];
  summary: string;
}

/**
 * Build the client-facing "Search & Analytics" rows for the monthly report from
 * the live Google reads. Plain owner language ("Found you on Google", not "GSC
 * clicks"). Only includes a surface when its status is "ok"; returns [] when
 * neither is connected so the caller omits the whole block.
 */
export function buildAnalyticsRows(search: SearchPerf, ga: GaPerf): EmailRow[] {
  const rows: EmailRow[] = [];

  if (search.status === "ok") {
    rows.push({ label: "Found you on Google", value: `${search.clicks.toLocaleString()} clicks` });
    rows.push({ label: "Shown on Google", value: `${search.impressions.toLocaleString()} times` });
    const topQuery = search.topQueries[0];
    if (topQuery) {
      rows.push({ label: "Top search", value: `"${topQuery.query}"` });
    }
  }

  if (ga.status === "ok") {
    rows.push({ label: "Visitors", value: ga.users.toLocaleString() });
  }

  return rows;
}

// Sections that are operator/plumbing concepts, not something an owner would
// recognize on their own site — never name these in a client-facing report.
const NON_CLIENT_SECTIONS = new Set([
  "settings",
  "config",
  "seo",
  "meta",
  "navigation",
  "capabilities",
  "components",
]);

/**
 * Build a single client-facing proof-of-work line: which of THEIR sections we
 * refreshed this week, in plain language. Deliberately NOT a debug log — no
 * internal verification timestamps ("checked live 3:06 PM"), no operator
 * sections, and NO "could not be confirmed" failure line. A paying client's
 * value report must never read like internal plumbing or admit an internal
 * verification miss; unconfirmed changes are an operator concern (the
 * change_verify_failed event), surfaced admin-side, not to the owner.
 * `_failedVerifications` is intentionally ignored here.
 */
export function formatVerificationLines(
  verifiedChanges: VerifiedChangeItem[],
  _failedVerifications: number
): string {
  const sections = Array.from(
    new Set(
      verifiedChanges
        .map((c) => c.section.trim().toLowerCase())
        .filter((s) => s.length > 0 && !NON_CLIENT_SECTIONS.has(s))
    )
  ).map(capitalise);

  if (sections.length === 0) return "";

  let list: string;
  if (sections.length === 1) list = sections[0];
  else if (sections.length === 2) list = `${sections[0]} and ${sections[1]}`;
  else list = `${sections.slice(0, -1).join(", ")}, and ${sections[sections.length - 1]}`;

  return `We refreshed your ${list} this week.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

/**
 * Format the traffic-anomaly story for the weekly email — the same "traffic
 * down 40%, likely because…" narrative the dashboard shows. Returns an empty
 * string when there's no anomaly, so it renders cleanly only when present.
 * Deterministic: reuses the anomaly's own owner-facing copy verbatim.
 */
export function formatAnomalyNarrative(anomaly: TrafficAnomaly | null): string {
  if (!anomaly) return "";
  return `${anomaly.headline}. ${anomaly.why} ${anomaly.suggestion}`;
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
  anomalyNarrative: string;
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

  const hasTrafficData = data.pageViews.total > 0 || data.bookingClicks.total > 0;
  if (data.pageViews.thisWeek > 0) {
    const plural = data.pageViews.thisWeek === 1 ? "person" : "people";
    paragraphs.push(
      `${greeting} ${data.pageViews.thisWeek} ${plural} found you this week (${data.pageViews.total} total so far).`,
    );
  } else if (hasTrafficData) {
    paragraphs.push(
      `${greeting} no new visits landed this week — a good moment to share your site or freshen up a section.`,
    );
  } else {
    // No data ever recorded — visitor tracking is still coming online. Don't
    // assert "0 visitors" as a measured fact to the owner.
    paragraphs.push(
      `${greeting} we're getting your visitor tracking wired up, so next week's report will start showing who's finding you.`,
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

  if (data.anomalyNarrative) {
    paragraphs.push(data.anomalyNarrative);
  }

  return paragraphs.join("\n\n");
}

async function generateReportSummary(data: ReportSummaryInput): Promise<string> {
  const staleSummary = data.staleSections
    .map((s) => `- ${s.section} (${s.daysSinceUpdate} days)`)
    .join("\n");

  // Service names are tenant-authored and search queries are external — strip
  // markup/newlines before they enter the Gemini prompt so a planted value can't
  // inject instructions into the report (parity with the agent-prompt hardening).
  const serviceSummary = data.topServices
    .map((s) => `- ${sanitizeEmailSubjectText(data.serviceNames[s.serviceId] || s.serviceId)}: ${s.thisWeek} clicks this week (${s.total} total)`)
    .join("\n");

  // Client-facing proof of work: which of the owner's sections we refreshed.
  // Never the raw admin activity feed or internal verification timestamps.
  const workBlock = formatVerificationLines(data.verifiedChanges, data.failedVerifications)
    ? `\nWhat we did on the site this week:\n${formatVerificationLines(data.verifiedChanges, data.failedVerifications)}`
    : "";

  // When there is no visit data at all (total 0), tracking is still coming
  // online — do NOT assert "0 people found you" as a measured fact.
  const hasTrafficData = data.pageViews.total > 0 || data.bookingClicks.total > 0;
  const statsBlock = hasTrafficData
    ? `Traffic this week:
- ${data.pageViews.thisWeek} people found the site (${data.pageViews.total} total)
- ${data.bookingClicks.thisWeek} booking clicks (${data.bookingClicks.total} total)`
    : `Visitor tracking is still coming online for this site — there is no visit data to report yet. Do NOT state a visitor or click count.`;

  const visibilityBlock = data.visibilityLines
    ? `\nVisibility changes this week (Google + AI, directional only):\n${data.visibilityLines}`
    : "";

  const anomalyBlock = data.anomalyNarrative
    ? `\nTraffic trend this week:\n${data.anomalyNarrative}`
    : "";

  let text: string;
  try {
    ({ text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `Write a short, warm weekly report email for ${data.ownerName} about their business website "${data.siteName}".

${statsBlock}

${serviceSummary ? `Top services by booking clicks:\n${serviceSummary}` : ""}

${data.topSearchQueries.length > 0 ? `Top searches that found the site:\n${data.topSearchQueries.map((q) => `- "${sanitizeEmailSubjectText(q.query)}" (${q.clicks} clicks, ${q.impressions} impressions)`).join("\n")}` : ""}

${staleSummary ? `Sections that haven't been updated in a while:\n${staleSummary}` : ""}
${workBlock}${visibilityBlock}${anomalyBlock}
Rules:
- 3-5 short paragraphs max
- This goes to a non-technical business owner. NEVER mention internal settings, admin actions, dashboards, verification checks, timestamps, or whether a change was "confirmed live" — those are our concern, not theirs.
- If there is real traffic or click data, lead with the most interesting number. If there is NO visit data yet, do NOT lead with or dwell on zero and do NOT imply the site is failing — open with what we did on the site and one concrete next step.
- If search query data is available, mention what people are searching to find the site — use their exact words
- If per-service data is available, mention the most popular service by name
- If sections are stale, suggest updating one specific section with a concrete idea
- If a "what we did on the site" line is provided, include it as-is — it's honest proof of work in the owner's own terms
- No filler or vague reassurance ("working behind the scenes", "building your presence"). Every sentence must say something concrete.
- Never use these words: leverage, utilize, implement, functionality, solution, seamless, robust, streamline, empower, unlock, elevate, cutting-edge, "in today's", "e-commerce". No em dashes and no feature-spec phrasing. Say the actual thing in plain words.
- If visibility changes are listed, include them as-is — these are position moves in Google or AI, use the exact phrasing provided
- If a traffic trend is listed, include it — it explains a meaningful rise or drop in visits and the next move; use the exact phrasing provided
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

  const [pageViews, bookingClicks, timestamps, activity, settings, services, perServiceClicks, searchData, events, dailyMetrics, searchPerf, gaPerf] =
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
      getDailyMetrics(tenantId, 30),
      // Live Search Console + GA4 for the report's Search & Analytics block.
      // Fail-soft by contract (always returns a status, never throws).
      getSearchConsolePerf(tenantId),
      getGa4Perf(tenantId),
    ]);

  const analyticsRows = buildAnalyticsRows(searchPerf, gaPerf);

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

  // Verification data for the COMPLETED prior week (Mon–Sun). The report runs
  // Monday, so the just-started week would be near-empty — suppressing the
  // "verified changes this week" proof lines. Use the previous full week.
  // UTC arithmetic (matches getWeekBounds in weekly-brief.ts) — local-time
  // methods mixed with UTC comparisons shifted the window by a day off-UTC.
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + diffToMonday - 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const { verifiedChanges, failedVerifications } = extractVerificationData(
    events,
    weekStart,
    weekEnd
  );

  const visibilityDiff = await extractVisibilityDiff(tenantId);
  const visibilityLines = formatVisibilityLines(visibilityDiff);

  // Same anomaly the dashboard shows (reports/page.tsx), carried into the email.
  const anomalyNarrative = formatAnomalyNarrative(detectTrafficAnomaly(dailyMetrics));

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
    anomalyNarrative,
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
    analyticsRows,
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
