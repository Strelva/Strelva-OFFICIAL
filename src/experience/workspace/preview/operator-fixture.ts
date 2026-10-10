import type { TenantReleaseState } from "@/platform/owner-entry/operator";
import type { OwnerInvitationsLoad } from "@/platform/owner-entry/operator-invitations";
import type { TenantDomainHealth } from "@/lib/domain-monitor";

/** Fictional canon content. These values and transports never enter live routes. */
export const OPERATOR_CLIENTS = [
  { id: "mooney", siteName: "The Mooney Firm" }, { id: "harbor", siteName: "Harbor Dental" },
  { id: "north", siteName: "North Coast Realty" }, { id: "lakeview", siteName: "Lakeview Yoga" }, { id: "fieldwork", siteName: "Fieldwork Studio" },
];
export const OPERATOR_WORKSPACE = "11111111-1111-4111-8111-111111111111";
export const OPERATOR_TIME = "2026-10-09T18:20:00Z";
export function operatorReleaseFixture(): TenantReleaseState {
  return { linked: true, tenantId: "mooney", workspaceId: OPERATOR_WORKSPACE, workspaceRelease: true, testerEmails: [], history: [], ownerEntryBlockers: [], flags: [
    { flag: "owner_entry", label: "Owner sign-in", envName: "STRELVA_OWNER_ENTRY", envMode: "workspace", row: "on", revision: 1, effective: "on" },
    { flag: "inquiries", label: "Inquiries in the workspace", envName: "STRELVA_INQUIRIES_RELEASE", envMode: "workspace", row: "on", revision: 1, effective: "on" },
    { flag: "website_rebuild", label: "Rebuilt site", envName: "STRELVA_WEBSITE_REBUILD_RELEASE", envMode: "workspace", row: "on", revision: 1, effective: "on" },
    { flag: "systems", label: "Systems", envName: "STRELVA_SYSTEMS_RELEASE", envMode: "workspace", row: "operators", revision: 1, effective: "operators" },
  ] };
}
export function operatorInvitationFixture(): OwnerInvitationsLoad {
  return { kind: "ready", state: { workspaceId: OPERATOR_WORKSPACE, workspaceName: "The Mooney Firm", operatorId: "33333333-3333-4333-8333-333333333333", hasOwner: true, exited: false, recipient: { email: "sheri@example.test", name: "Sheri", from: "record", source: "tenant_import", verified: false }, tenants: [{ tenantId: "mooney", tenantStableId: "44444444-4444-4444-8444-444444444444", siteName: "The Mooney Firm" }], pending: [] } };
}
export function operatorCheckFixture(): TenantDomainHealth[] {
  return OPERATOR_CLIENTS.map((client, index) => {
    const host = ["attymooney.example", "harbordental.example", "northcoastrealty.example", "lakeviewyoga.example", "fieldwork.example"][index]!;
    const state = index === 2 ? "down" : "up";
    return { tenantId: client.id, siteName: client.siteName, ownerName: "", primaryHost: host, worst: state, nearestExpiryDays: ([82, 12, 61, null, 40][index] ?? null), checks: [{ host, kind: "custom", url: `https://${host}`, httpStatus: state === "down" ? 503 : 200, bytes: null, state, reason: state === "down" ? "Site returned an error" : undefined, expiresAt: null, daysToExpiry: ([82, 12, 61, null, 40][index] ?? null), checkedAt: OPERATOR_TIME, latencyMs: null }] };
  });
}
export const CONVERSION_ROWS = [
  { from: "/dashboard/site", to: "lakeviewyoga.example", detail: "A connected site · Squarespace keeps it", warning: false },
  { from: "/dashboard/leads", to: "Inquiries", detail: "[n] people, all with an email", warning: false },
  { from: "/dashboard/schedule", to: "Classes", detail: "[n] bookings · 2 have no end time, set to 60 min", warning: true },
  { from: "/dashboard/reviews", to: "Google listing", detail: "Needs the owner to allow Google access", warning: true },
  { from: "/dashboard/store", to: "Store · Square", detail: "Read-only Connection", warning: false },
];
