import type { OwnerCareReportItem, CareReportAgencyView, CareReportFacts, CareReportList, CareReportReleaseSnapshot } from "@/platform/care-reports";
import type { OwnerBrand } from "@/platform/infra/agency-brand";

/** Fictional data for the local preview. Nothing here is a real business, agency or record. */
export const PREVIEW_AGENCY_ID = "5e000000-0000-4000-8000-0000000000a0";
export const PREVIEW_BUSINESS_ID = "5e000000-0000-4000-8000-0000000000b0";
export const PREVIEW_REPORT_ID = "5e000000-0000-4000-8000-0000000000c0";
const SYSTEM = "5e000000-0000-4000-8000-0000000000e0";

export const PREVIEW_BRAND: OwnerBrand = { agencyId: PREVIEW_AGENCY_ID, name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" };
export const PREVIEW_BRAND_UNAVAILABLE: OwnerBrand = { agencyId: null, name: "Agency identity unavailable", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" };

export const PREVIEW_NOTE = "We moved your booking button above the fold and fixed the hours on Google.";

export const PREVIEW_FACTS: CareReportFacts = {
  version: 1,
  month: "2026-09",
  from: "2026-09-01T00:00:00+00:00",
  through: "2026-10-01T00:00:00+00:00",
  generatedAt: "2026-10-01T09:00:00+00:00",
  business: { workspaceId: PREVIEW_BUSINESS_ID, name: "Harbor Dental" },
  agency: { workspaceId: PREVIEW_AGENCY_ID, name: "North Studio" },
  changes: {
    total: 3, confirmed: 2, notConfirmed: 0, notChecked: 1,
    items: [
      { systemId: SYSTEM, systemName: "Harbor Dental website", systemKind: "website", release: 6, summary: "Fall hours on the website and Google.", at: "2026-09-04T14:00:00+00:00", check: "confirmed", source: "website_deploy" },
      { systemId: SYSTEM, systemName: "Harbor Dental website", systemKind: "website", release: 7, summary: "Booking button moved above the fold.", at: "2026-09-11T16:00:00+00:00", check: "confirmed", source: "website_code" },
      { systemId: SYSTEM, systemName: "Harbor Dental website", systemKind: "website", release: 8, summary: "New-patient form asks for the insurance member ID.", at: "2026-09-19T10:00:00+00:00", check: "not_checked", source: "website_content" },
    ],
  },
  requests: {
    doneCount: 2, openCount: 1, askedCount: 3,
    done: [
      { id: "5e000000-0000-4000-8000-0000000000f1", request: "Change the opening hours for fall", doneAt: "2026-09-04T14:30:00+00:00", kind: "website_change" },
      { id: "5e000000-0000-4000-8000-0000000000f2", request: "Write the September newsletter", doneAt: "2026-09-22T12:00:00+00:00", kind: "delivery" },
    ],
  },
  outcomes: {
    available: true,
    month: {
      workspaceId: PREVIEW_BUSINESS_ID, month: "2026-09", sites: 1,
      visits: { kind: "counted", value: 412 }, inquiries: { kind: "counted", value: 9 },
      answered: { kind: "linked", value: 8, withinDay: 7 }, bookings: { kind: "counted", value: 3, native: 3, legacy: null },
      bookingsFromInquiry: { kind: "linked", value: 2, joins: [] }, reviews: { kind: "counted", value: 2 },
    },
  },
  siteChecks: {
    hosted: { checks: 30, healthy: 30, lastCheckedAt: "2026-09-30T23:00:00+00:00" },
    readBacks: { confirmed: 2, notConfirmed: 0, notChecked: 0 },
    latest: [{ host: "harbordental.com", state: "up", checkedAt: "2026-09-30T23:00:00+00:00" }],
  },
  usage: { calls: 42, byPurpose: { ask: 30, report: 12 } },
  time: { minutes: 185, entries: 4, byCategory: { change: 95, delivery: 60, support: 30 } },
};

export const PREVIEW_EMPTY_FACTS: CareReportFacts = {
  ...PREVIEW_FACTS,
  changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] },
  requests: { doneCount: 0, openCount: 0, askedCount: 0, done: [] },
  outcomes: { available: false, reason: "no_member" },
  siteChecks: { hosted: { checks: 0, healthy: 0, lastCheckedAt: null }, readBacks: { confirmed: 0, notConfirmed: 0, notChecked: 0 }, latest: [] },
  usage: { calls: 0, byPurpose: {} },
  time: { minutes: 0, entries: 0, byCategory: {} },
};

export const PREVIEW_SNAPSHOT: CareReportReleaseSnapshot = { ...PREVIEW_FACTS, agencyNote: PREVIEW_NOTE, release: 2, publishedAt: "2026-10-02T09:00:00+00:00" };
export const PREVIEW_RELEASES = [
  { number: 2, publishedAt: "2026-10-02T09:00:00+00:00" },
  { number: 1, publishedAt: "2026-10-01T10:00:00+00:00" },
] as const;

const releaseRow = (number: number, publishedAt: string) => ({ id: `5e000000-0000-4000-8000-00000000010${number}`, number, publishedAt, snapshot: { ...PREVIEW_SNAPSHOT, release: number, publishedAt } as Record<string, unknown> });

export function previewAgencyView(options: { canWrite: boolean; shared?: boolean; shareLink?: boolean } = { canWrite: true, shared: true }): CareReportAgencyView {
  return {
    audience: "agency",
    canWrite: options.canWrite,
    report: {
      id: PREVIEW_REPORT_ID, agencyWorkspaceId: PREVIEW_AGENCY_ID, businessWorkspaceId: PREVIEW_BUSINESS_ID, businessName: "Harbor Dental", month: "2026-09",
      revision: 3, draft: PREVIEW_FACTS as unknown as Record<string, unknown>, agencyNote: PREVIEW_NOTE,
      generatedAt: "2026-10-01T09:00:00+00:00", updatedAt: "2026-10-01T11:00:00+00:00",
    },
    releases: options.shared === false ? [] : PREVIEW_RELEASES.map(item => releaseRow(item.number, item.publishedAt)),
    deliveries: options.shared === false ? [] : [{ releaseNumber: 1, status: "suppressed", reason: "email_off", recordedAt: "2026-10-01T10:05:00+00:00" }],
    shareLink: options.shareLink ? { createdAt: "2026-10-02T09:10:00+00:00" } : null,
  };
}

export const PREVIEW_OWNER_REPORTS: OwnerCareReportItem[] = [
  { reportId: PREVIEW_REPORT_ID, agencyWorkspaceId: PREVIEW_AGENCY_ID, agencyName: "North Studio", month: "2026-09", latestRelease: { number: 2, publishedAt: "2026-10-02T09:00:00+00:00" } },
  { reportId: "5e000000-0000-4000-8000-0000000000c1", agencyWorkspaceId: PREVIEW_AGENCY_ID, agencyName: "North Studio", month: "2026-08", latestRelease: { number: 1, publishedAt: "2026-09-02T09:00:00+00:00" } },
];

const clientRow = (n: number, name: string, over: Partial<CareReportList["clients"][number]> = {}): CareReportList["clients"][number] => ({
  workspaceId: `5e000000-0000-4000-8000-0000000001${n}0`, name, canWrite: true, tenantIds: [], report: null,
  soFar: { releasesRecorded: 4, changesVerified: 3 }, ...over,
});

/** One client in each row state: shared with email held, draft, not generated, staff read-only. */
export const PREVIEW_CAREPLAN_LIST: CareReportList = {
  agencyWorkspaceId: PREVIEW_AGENCY_ID,
  month: "2026-09",
  canGenerate: true,
  clients: [
    clientRow(1, "Harbor Dental", { report: { id: PREVIEW_REPORT_ID, revision: 3, generatedAt: "2026-10-01T09:00:00+00:00", latestRelease: { number: 2, publishedAt: "2026-10-02T09:00:00+00:00" }, lastDelivery: { status: "suppressed", reason: "email_off", recordedAt: "2026-10-02T09:05:00+00:00" } } }),
    clientRow(2, "Juniper Cafe", { report: { id: "5e000000-0000-4000-8000-0000000000c2", revision: 1, generatedAt: "2026-10-01T09:00:00+00:00", latestRelease: null, lastDelivery: null } }),
    clientRow(3, "Lakeside Yoga", { soFar: { releasesRecorded: 0, changesVerified: 0 } }),
    clientRow(4, "Elmwood Books", { canWrite: false }),
  ],
};

export const PREVIEW_CAREPLAN_SKIPS = {
  generated: 2,
  skipped: [
    { workspaceId: "5e000000-0000-4000-8000-000000000140", name: "Elmwood Books", reason: "not_allowed" as const },
    { workspaceId: "5e000000-0000-4000-8000-000000000150", name: "Pier 9 Tackle", reason: "not_available" as const },
    { workspaceId: "5e000000-0000-4000-8000-000000000160", name: "Cobble Hill Tailors", reason: "failed" as const },
  ],
};
