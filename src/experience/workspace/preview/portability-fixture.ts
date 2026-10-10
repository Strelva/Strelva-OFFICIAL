import type { WorkspaceExitOptions, WorkspaceExitState } from "@/platform/workspace-exit/contracts";
import type { ExportManifestRow } from "@/experience/workspace/WorkspaceExport";

/** Fictional Harbor Workshop records for local interface proof only. */
export const PORTABILITY_WORKSPACE = "6e000000-0000-4000-8000-000000000010";
export const PORTABILITY_BUILD = "6e000000-0000-4000-8000-000000000020";
export const PORTABILITY_USER = "6e000000-0000-4000-8000-000000000030";
export const PORTABILITY_HANDOFF: NonNullable<WorkspaceExitOptions["handoff"]> = {
  businessRecordRetained: true, dataDeleted: false,
  systems: [{ id: "6e000000-0000-4000-8000-000000000040", name: "Harbor Workshop website", lifecycle: "live" }],
  sites: [{ tenantId: "harbor-fixture", tenantStableId: "6e000000-0000-4000-8000-000000000050", siteName: "Harbor Workshop — Buffalo", steps: [
    { kind: "export", status: "completed", detail: "Export the business record and every linked System.", evidence: "Business archive prepared; owner download available for seven days." },
    { kind: "files", status: "pending", detail: "Hand over the repository, website files and assets." },
    { kind: "billing", status: "pending", detail: "Review billing cancellation with the owner. No charge has changed." },
    { kind: "domain", status: "pending", detail: "Arrange the domain move. No DNS change has been made." },
  ] }],
};
export const PORTABILITY_COMPLETED: WorkspaceExitState = {
  id: "6e000000-0000-4000-8000-000000000060", workspaceId: PORTABILITY_WORKSPACE, status: "completed",
  requestedAt: "2026-10-07T12:00:00.000Z", completedAt: "2026-10-07T12:01:00.000Z", requestedBy: PORTABILITY_USER,
  futureWork: "paused", providerParticipation: "revoked", maintainedResources: { kind: "stopped" },
  summary: { standingPaused: 1, standingRevoked: 0, scheduledPaused: 2, scheduledCancelled: 0, assignmentsRevoked: 1, providerDeliveriesRevoked: 1, investigationsPaused: 2, retainedAccepted: 1, retainedUnknown: 1 },
  retainedObligations: [{ workId: "6e000000-0000-4000-8000-000000000070", title: "Published opening hours", status: "accepted", effect: "accepted" },
    { workId: "6e000000-0000-4000-8000-000000000080", title: "Provider handover confirmation", status: "unknown", effect: "unknown" }],
  resources: [], handoff: PORTABILITY_HANDOFF,
};

export const PORTABILITY_MANIFEST: ExportManifestRow[] = [
  { title: "Website pages and photos", count: "10 · 21", detail: "Saved pages and original-image references", included: true },
  { title: "Inquiries and replies", count: "12", detail: "Stored messages, dates and delivery evidence", included: true },
  { title: "Session requests", count: "3", detail: "Business booking records", included: true },
  { title: "Business record", count: "38 facts", detail: "With where each one came from", included: true },
  { title: "History of every change", count: "24", detail: "Who, what, when and the receipt", included: true },
  { title: "Private documents", count: "4", detail: "Stored records and authenticated download references", included: true },
  { title: "Card details", count: "—", detail: "Held by Stripe, never by Strelva", included: false },
  { title: "Other people’s sign-ins", count: "—", detail: "Theirs, not the business’s", included: false },
];
