/**
 * Fixtures for the legacy website dashboard preview (XA lane
 * xs-legacy-dashboard). Fictional only: Harbor Dental, Dr. Amy Lin,
 * 1180 Elmwood Ave; North Studio and Maya Okafor. Nothing here touches a real
 * tenant, provider or send.
 */
import type { ActivityEntry } from "@/lib/storage/activity-store";
import type { OwnerRetentionSignals } from "@/lib/retention";
import type { UnifiedEvent } from "@/lib/types";
import type { DashboardSurface } from "@/lib/dashboard-surfaces";
import { xaHoursAgo } from "./xa-day";

export const LEGACY_BASE = "/preview/strelva/xa/xs-legacy-dashboard";
export const LEGACY_TENANT = "harbor-dental";
export const LEGACY_BUSINESS = "Harbor Dental";
export const LEGACY_OWNER = "Dr. Amy Lin";
export const LEGACY_EMAIL = "dr.lin@harbordental.com";
/** The fictional homepage the site editor frames; the preview never loads a real website. */
export const LEGACY_SITE_FIXTURE = "/preview/strelva/xa/xs-legacy-dashboard/site-fixture";

export type LegacyState = "ready" | "empty" | "loading" | "error" | "waiting" | "done";
export const LEGACY_STATES: readonly LegacyState[] = ["ready", "empty", "loading", "error", "waiting", "done"];

export function legacyState(value: string | undefined): LegacyState {
  return LEGACY_STATES.find((state) => state === value) ?? "ready";
}

/** `hours` before 8:14 am on the shared fixture day (Monday, November 23, 2026), never the wall clock. */
export function ago(hours: number): string {
  return xaHoursAgo(hours);
}

export const LEGACY_SURFACES: DashboardSurface[] = [
  { id: "today", label: "Home", href: "/dashboard", state: "shown", group: "manage" },
  { id: "ask-ai", label: "Ask Strelva", href: "/dashboard/chat", state: "shown", group: "manage" },
  { id: "website", label: "Website", href: "/dashboard/site", state: "shown", group: "presence" },
  { id: "google-business", label: "Google Business", href: "/dashboard/google", state: "shown", group: "presence" },
  { id: "analytics", label: "Analytics", href: "/dashboard/analytics", state: "shown", group: "presence" },
  { id: "reports", label: "Reports", href: "/dashboard/reports", state: "shown", group: "presence" },
  { id: "reviews", label: "Reviews", href: "/dashboard/reviews", state: "shown", group: "presence" },
  { id: "schedule", label: "Schedule", href: "/dashboard/schedule", state: "shown", group: "set" },
  { id: "roster", label: "Roster", href: "/dashboard/roster", state: "shown", group: "set" },
  { id: "members", label: "Members", href: "/dashboard/members", state: "shown", group: "set" },
];

function event(partial: Partial<UnifiedEvent> & Pick<UnifiedEvent, "id" | "title">): UnifiedEvent {
  return { tenantId: LEGACY_TENANT, source: "ai", type: "content_update", body: "", status: "pending", createdAt: ago(2), metadata: {}, ...partial } as UnifiedEvent;
}

export function legacyPending(state: LegacyState): UnifiedEvent[] {
  if (state === "empty" || state === "done") return [];
  return [
    event({
      id: "evt-hours", title: "Thanksgiving hours on your homepage", body: "", createdAt: ago(3),
      metadata: { section: "hero", diffs: [
        { field: "Hours note", type: "added", before: "", after: "We're closed Thursday and Friday, Nov 26 and 27, for Thanksgiving. Saturday the 28th we're open 9 to 1 as usual." },
        { field: "Booking line", type: "changed", before: "Book any weekday online, same-week visits.", after: "Book online any day but Nov 26 and 27, same-week visits." },
      ] },
    }),
    event({
      id: "evt-gbp", title: "Google post: new-patient cleanings", createdAt: ago(20),
      metadata: { kind: "gbp_post_draft", summary: "New patients welcome. Cleanings and checkups for kids and adults at 1180 Elmwood Ave. Same-week visits.", ctaUrl: "https://harbordental.com/book" },
    }),
    event({
      id: "evt-review", source: "google", type: "review", title: "Ana R. left 5 stars", body: "Dr. Lin was gentle with my son and the front desk fit us in the same week.", createdAt: ago(30),
      metadata: { author: "Ana R.", rating: 5 },
    }),
  ];
}

export function legacyResolved(): UnifiedEvent[] {
  return [
    event({ id: "evt-ins", title: "Delta Dental added to the insurance list", status: "approved", createdAt: ago(60), resolvedAt: ago(58) } as Partial<UnifiedEvent> & Pick<UnifiedEvent, "id" | "title">),
    event({ id: "evt-faq", title: "FAQ: do you see children?", status: "approved", createdAt: ago(120), resolvedAt: ago(118) } as Partial<UnifiedEvent> & Pick<UnifiedEvent, "id" | "title">),
    event({ id: "evt-promo", title: "Summer whitening promotion", status: "dismissed", createdAt: ago(200), resolvedAt: ago(190) } as Partial<UnifiedEvent> & Pick<UnifiedEvent, "id" | "title">),
  ];
}

export function legacyActivity(): ActivityEntry[] {
  return [
    { text: "Updated hero", time: ago(1.2), type: "ai", section: "hero", actor: "ai" },
    { text: "Saturday hours are back: 9 to 1 every week.", time: ago(6), type: "gbp-post", actor: "ai" },
    { text: "Replied to a 5-star review", time: ago(26), type: "review-reply", actor: "user" },
    { text: "Updated FAQ", time: ago(52), type: "ai", section: "faq", actor: "ai" },
    { text: "Updated contact", time: ago(80), type: "ai", section: "contact", actor: "admin" },
  ];
}

export function legacyRetention(): OwnerRetentionSignals {
  return {
    aiChangesThisWeek: 3, trafficAfterAiUpdates: 412, dashboardOpensThisWeek: 4, aiChatOpensThisWeek: 2, reportViewsThisWeek: 1,
    referralsThisWeek: 0, engagementSignalsThisWeek: 3, noAiUsageDays: 0, noDashboardOpenDays: 0, churnRisk: "healthy",
    riskReason: "", nextAction: "", ownerNextAction: "Ask for a short page about same-week emergency visits. People search for it on Sundays.",
  };
}

export function legacyLeads(state: LegacyState) {
  if (state === "empty") return { count: 0, recent: [] };
  return {
    count: 7,
    recent: [
      { id: "lead-1", name: "Jordan Pierce", email: "jordan.pierce@example.com", message: "Do you take Cigna for a child's first cleaning?", createdAt: ago(5) },
      { id: "lead-2", name: "Priya Nair", email: "priya.n@example.com", message: "Looking for a Saturday checkup for two adults.", createdAt: ago(28) },
      { id: "lead-3", name: "Sam Ortiz", email: null, message: "Chipped a tooth, can I come in this week?", createdAt: ago(50) },
    ],
  };
}
