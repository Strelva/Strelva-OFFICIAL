/**
 * Fictional fixtures for the xs-apps-care XA preview (Harbor Dental, Dr. Amy
 * Lin, 1180 Elmwood Ave; North Studio, Maya Okafor). Nothing here is a real
 * business, person, listing or record, and nothing is sent anywhere.
 */
import type { ApplicationUseSnapshot } from "@/products/applications/client";
import type { ServiceRequest } from "@/platform/service-requests/types";

/** Every preview screen in the lane, as /preview/strelva/xa/xs-apps-care/<screen>. */
export const XS_SCREENS = [
  "app-use", "custom-app-new", "custom-app-use", "agency-app-draft", "agency-website",
  "care-report-agency", "care-report-owner", "care-report-shared",
  "home-finder-setup", "home-finder-buyer", "home-finder-loading", "home-finder-unavailable",
  "units", "delivery-status", "delivery-queue", "delivery-request", "contribute",
] as const;
export type XsScreen = (typeof XS_SCREENS)[number];

export const HARBOR_ID = "5c000000-0000-4000-8000-0000000000b1";
export const NORTH_ID = "5c000000-0000-4000-8000-0000000000a1";
export const AMY_ID = "5c000000-0000-4000-8000-0000000000c1";
export const MAYA_ID = "5c000000-0000-4000-8000-0000000000c2";
export const WORK_ID = "5c000000-0000-4000-8000-0000000000d1";
export const BINDING_ID = "5c000000-0000-4000-8000-0000000000e1";
export const REQUEST_ID = "5c000000-0000-4000-8000-0000000000f1";

export const CLIENT_COLORS = { harbor: "#2f5236", northCoast: "#9c522c", lakeview: "#4f7590", fieldwork: "#6b6f68" } as const;

/** The agency's clients with time this month (96/74/39/22 minutes). */
export const AGENCY_CLIENTS = [
  { id: "harbor", name: "Harbor Dental", detail: "96 min", color: CLIENT_COLORS.harbor },
  { id: "north-coast", name: "North Coast Realty", detail: "74 min", color: CLIENT_COLORS.northCoast },
  { id: "lakeview", name: "Lakeview Mediation", detail: "39 min", color: CLIENT_COLORS.lakeview },
  { id: "fieldwork", name: "Fieldwork Studio", detail: "22 min", color: CLIENT_COLORS.fieldwork },
] as const;

/* ---------- An internal tool in use ---------- */

const intakeFields = [
  { id: "name", label: "Patient name", type: "text" as const, required: true },
  { id: "reason", label: "Reason for the visit", type: "text" as const, required: true },
  { id: "insurance", label: "Insurance", type: "select" as const, required: true, options: ["Delta Dental", "Cigna", "MetLife", "No insurance"] },
  { id: "first", label: "First visit", type: "boolean" as const, required: false },
  { id: "date", label: "Preferred date", type: "date" as const, required: false },
];

export const INTAKE_RECORDS: ApplicationUseSnapshot["records"] = [
  { id: "r-ana", revision: 2, values: { name: "Ana Reyes", reason: "Cleaning and a check on a sore molar", insurance: "Delta Dental", first: true, date: "2026-10-21" } },
  { id: "r-james", revision: 1, values: { name: "James Okoro", reason: "Crown fitting, follow-up from Sep 30", insurance: "Cigna", first: false, date: "2026-10-22" } },
  { id: "r-lena", revision: 1, values: { name: "Lena Park", reason: "Child's first visit, age 6", insurance: "MetLife", first: true } },
];

export function intakeSnapshot(state: string, records = INTAKE_RECORDS): ApplicationUseSnapshot {
  const readOnly = state === "read-only";
  return {
    workId: WORK_ID, title: "New-patient intake", releaseVersion: 3,
    views: readOnly ? [{ kind: "list", fields: intakeFields }] : [{ kind: "form", fields: intakeFields }, { kind: "list", fields: intakeFields }],
    records: state === "empty" ? [] : records,
    access: { views: readOnly ? ["list"] : ["form", "list"], recordRead: "all", recordEdit: readOnly ? "none" : "own", recordSubmit: !readOnly, expiresAt: "2027-01-31T00:00:00Z" },
  };
}

export const CUSTOM_TOOL_HTML = "<!doctype html><html><head><style>body{font-family:'DM Sans',system-ui,sans-serif;margin:32px;color:#161715;background:#fff}h1{font-size:24px;font-weight:600;margin:0 0 6px}p{color:#6b6f68;margin:0 0 20px}table{width:100%;border-collapse:collapse;font-size:15px}td,th{padding:10px 0;border-top:1px solid #e6e5e0;text-align:left}th{color:#81847d;font-weight:500;font-size:13px}</style></head><body><h1>Chair schedule</h1><p>Who is in which chair this week at 1180 Elmwood Ave.</p><table><tr><th>Day</th><th>Chair 1</th><th>Chair 2</th></tr><tr><td>Mon</td><td>Dr. Lin</td><td>Priya (hygiene)</td></tr><tr><td>Tue</td><td>Dr. Lin</td><td>Priya (hygiene)</td></tr><tr><td>Wed</td><td>Dr. Lin</td><td>Open</td></tr></table></body></html>";

/* ---------- Agency website draft ---------- */

export const WEBSITE_GRANT = {
  id: "5c000000-0000-4000-8000-000000000101", managedWebsiteBindingId: BINDING_ID, businessWorkspaceId: HARBOR_ID, tenantId: "harbor-dental",
  deliveryId: "5c000000-0000-4000-8000-000000000102", assignmentId: "5c000000-0000-4000-8000-000000000103", agencyWorkspaceId: NORTH_ID,
  operatorUserId: MAYA_ID, grantedBy: AMY_ID, status: "active", expiresAt: "2027-01-31T00:00:00.000Z", createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z", revokedAt: null, revokedBy: null,
} as const;

export const WEBSITE_STATE = {
  tenantId: "harbor-dental", section: "hero", revision: 4, dataHash: "0123456789abcdef0123456789abcdef",
  data: { headline: "Gentle dentistry on Elmwood Avenue", subheadline: "New patients are seen within a week. We take Delta Dental, Cigna and MetLife.", tagline: "Harbor Dental · 1180 Elmwood Ave", ctaText: "Book a visit", ctaLink: "/book" },
};

/* ---------- Home Finder ---------- */

export const HOME_FINDER_BINDING = {
  id: "5c000000-0000-4000-8000-000000000201", systemId: "5c000000-0000-4000-8000-000000000202", workspaceId: "5c000000-0000-4000-8000-000000000203",
  agencyId: NORTH_ID, externalInstallationId: "lakeshore-homes-01", brokerageName: "Lakeshore Homes", approvedOrigin: "https://lakeshorehomes.com",
  licenseReference: "Signed license LH-2026-10", licenseExpiresAt: "2027-06-30T00:00:00.000Z", sourceName: "Western New York listings feed",
  revision: 3, status: "active", lifecycle: "draft", qualifiedAt: null, runtimeAllowed: false, changeNumber: 5,
  readiness: [
    { requirement: "Broker-signed license", state: "confirmed", source: "Lakeshore Homes", observedAt: "2026-10-14T15:00:00.000Z", responsibleParty: "Brokerage" },
    { requirement: "Listings provider grant", state: "confirmed", source: "Listings provider", observedAt: "2026-10-14T15:00:00.000Z", responsibleParty: "Provider" },
    { requirement: "Verified inquiry address", state: "unverified", source: "Lakeshore Homes", observedAt: "2026-10-15T09:00:00.000Z", responsibleParty: "Brokerage" },
  ],
} as const;

export const HOME_SEARCH = {
  source: { id: "trestle", name: "Western New York listings feed", mode: "live", isLive: true, description: "Fixture only", freshnessWindowMinutes: 30 },
  fetchedAt: "2026-10-16T13:00:00Z", sourceCheckedAt: "2026-10-16T13:00:00Z", count: 3,
  listings: [
    { id: "l1", inquiryToken: "fixture-1", address: { line: "84 Bidwell Parkway", city: "Buffalo", state: "NY", postalCode: "14222", latitude: null, longitude: null }, price: 389000, bedrooms: 4, bathrooms: 2, publicRemarks: "Brick colonial across from the parkway. Original woodwork, new roof in 2024.", photos: [], listAgentName: "Dana Whitfield", listOfficeName: "Lakeshore Homes", sourceSystemName: "Western New York listings feed", modifiedAt: "2026-10-15T12:00:00Z", status: "active" },
    { id: "l2", inquiryToken: "fixture-2", address: { line: "211 Ashland Avenue", city: "Buffalo", state: "NY", postalCode: "14222", latitude: null, longitude: null }, price: 315000, bedrooms: 3, bathrooms: 1.5, publicRemarks: "Upper and lower porches, walk to Elmwood shops.", photos: [], listAgentName: null, listOfficeName: "Lakeshore Homes", sourceSystemName: null, modifiedAt: "2026-10-14T12:00:00Z", status: "coming-soon" },
    { id: "l3", inquiryToken: "fixture-3", address: { line: "17 Lancaster Avenue", city: "Buffalo", state: "NY", postalCode: "14222", latitude: null, longitude: null }, price: 452000, bedrooms: 5, bathrooms: 3, publicRemarks: null, photos: [], listAgentName: "Dana Whitfield", listOfficeName: "Lakeshore Homes", sourceSystemName: "Western New York listings feed", modifiedAt: "2026-10-13T12:00:00Z", status: "active-under-contract" },
  ],
};

/* ---------- Locations ---------- */

export const UNIT_BUSINESSES = [{ id: HARBOR_ID, name: "Harbor Dental", role: "owner" }, { id: "5c000000-0000-4000-8000-0000000000b2", name: "Harbor Dental Kids", role: "owner" }];
export const UNITS = [
  { id: "5c000000-0000-4000-8000-000000000301", organizationId: HARBOR_ID, businessId: HARBOR_ID, parentId: null, name: "Harbor Dental", kind: "business", status: "active", revision: 2, versionIds: [] },
  { id: "5c000000-0000-4000-8000-000000000302", organizationId: HARBOR_ID, businessId: HARBOR_ID, parentId: "5c000000-0000-4000-8000-000000000301", name: "Elmwood, 1180 Elmwood Ave", kind: "location", status: "active", revision: 4, versionIds: ["5c000000-0000-4000-8000-000000000311", "5c000000-0000-4000-8000-000000000312"] },
  { id: "5c000000-0000-4000-8000-000000000303", organizationId: HARBOR_ID, businessId: HARBOR_ID, parentId: "5c000000-0000-4000-8000-000000000301", name: "Hertel, 1504 Hertel Ave", kind: "location", status: "active", revision: 1, versionIds: ["5c000000-0000-4000-8000-000000000313"] },
  { id: "5c000000-0000-4000-8000-000000000304", organizationId: HARBOR_ID, businessId: "5c000000-0000-4000-8000-0000000000b2", parentId: null, name: "Harbor Dental Kids", kind: "division", status: "active", revision: 1, versionIds: [] },
  { id: "5c000000-0000-4000-8000-000000000305", organizationId: HARBOR_ID, businessId: HARBOR_ID, parentId: "5c000000-0000-4000-8000-000000000301", name: "Kenmore (closed 2025)", kind: "location", status: "archived", revision: 6, versionIds: [] },
];

/* ---------- Delivery ---------- */

const at = (iso: string) => iso;
/** Who is who on the fixture delivery, as the API's `people` answers it. */
export function deliveryPeople(viewerIsAgencyOperator: boolean) {
  return { askedBy: "Dr. Amy Lin", operator: "Maya Okafor", agency: "North Studio", viewerIsAgencyOperator };
}

export function deliveryRequest(stage: "proposed" | "accepted" | "running" | "submitted" | "done" | "blocked", due = "2026-10-16T21:00:00Z"): ServiceRequest {
  const base = {
    id: REQUEST_ID, businessId: HARBOR_ID, status: "requested" as const,
    request: "Add a new-patient page with insurance, first-visit steps and a booking button.", outcome: "New-patient page",
    context: {}, scope: ["website_delivery"], provider: { kind: "agency" as const, agencyWorkspaceId: NORTH_ID },
    providerAcceptance: { status: "accepted" as const, actorId: MAYA_ID, acceptedAt: at("2026-10-13T14:00:00Z"), note: null },
    installationId: null, deliveryId: null, revision: 4, createdBy: AMY_ID, createdAt: at("2026-10-13T13:00:00Z"), updatedAt: at("2026-10-15T13:00:00Z"),
  };
  if (stage === "accepted") return { ...base, deliveryCommitment: null } as unknown as ServiceRequest;
  const commitment = {
    version: 1 as const, status: stage === "done" ? "accepted" as const : stage === "blocked" ? "running" as const : stage, operatorId: MAYA_ID,
    termsReference: "North Studio care plan, October", deliveryDefinition: "A new-patient page at harbordental.com/new-patients with insurance, what to bring, and the booking button.",
    scope: ["website_delivery"], proposedAt: at("2026-10-14T15:00:00Z"),
    startedAt: stage === "proposed" ? null : at("2026-10-15T21:00:00Z"), dueAt: stage === "proposed" ? null : at(due),
    customerAcceptedBy: stage === "proposed" ? null : AMY_ID, customerAcceptedAt: stage === "proposed" ? null : at("2026-10-15T21:00:00Z"),
    blocker: stage === "blocked" ? { note: "Waiting on the insurance list from the front desk", actorId: MAYA_ID, at: at("2026-10-15T16:00:00Z") } : null,
    result: stage === "submitted" || stage === "done" ? { websiteBindingId: BINDING_ID, repository: "north-studio/harbor-dental", commitSha: "4f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39", reviewUrl: "https://preview.harbordental.com/new-patients", desktopChecked: true, mobileChecked: true, primaryActionChecked: true, submittedAt: at("2026-10-15T20:00:00Z"), submittedBy: MAYA_ID } : null,
    decision: stage === "done" ? { kind: "accepted" as const, note: "Looks right. Thank you, Maya.", actorId: AMY_ID, at: at("2026-10-16T08:10:00Z") } : null,
  };
  return { ...base, deliveryCommitment: commitment } as unknown as ServiceRequest;
}
