import type { CareReportFacts } from "@/platform/care-reports/contracts";

export const AGENCY = "7f000000-0000-4000-8000-0000000000a0";
export const BUSINESS = "7f000000-0000-4000-8000-0000000000b0";
export const REPORT = "7f000000-0000-4000-8000-0000000000c0";
export const RELEASE = "7f000000-0000-4000-8000-0000000000d0";

export function facts(patch: Partial<CareReportFacts> = {}): CareReportFacts {
  return {
    version: 1,
    month: "2026-10",
    from: "2026-10-01T00:00:00+00:00",
    through: "2026-11-01T00:00:00+00:00",
    generatedAt: "2026-11-01T01:00:00+00:00",
    business: { workspaceId: BUSINESS, name: "Harbor Dental" },
    agency: { workspaceId: AGENCY, name: "North Studio" },
    changes: {
      total: 2, confirmed: 1, notConfirmed: 0, notChecked: 1,
      items: [
        { systemId: "7f000000-0000-4000-8000-0000000000e0", systemName: "Website", systemKind: "website", release: 3, summary: "Hours changed.", at: "2026-10-05T10:00:00+00:00", check: "confirmed", source: "website_deploy" },
        { systemId: "7f000000-0000-4000-8000-0000000000e0", systemName: "Website", systemKind: "website", release: 4, summary: null, at: "2026-10-06T10:00:00+00:00", check: "not_checked", source: "website_content" },
      ],
    },
    requests: { doneCount: 1, openCount: 0, askedCount: 1, done: [{ id: "7f000000-0000-4000-8000-0000000000f0", request: "Change the hours", doneAt: "2026-10-05T10:00:00+00:00", kind: "website_change" }] },
    outcomes: { available: false, reason: "no_member" },
    siteChecks: { hosted: { checks: 0, healthy: 0, lastCheckedAt: null }, readBacks: { confirmed: 1, notConfirmed: 0, notChecked: 0 }, latest: [] },
    usage: { calls: 2, byPurpose: { ask: 2 } },
    time: { minutes: 200, entries: 3, byCategory: { change: 200 } },
    ...patch,
  };
}
