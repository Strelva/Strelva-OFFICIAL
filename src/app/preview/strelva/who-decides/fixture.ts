/**
 * Fictional operator fixtures for Who decides and Owner not told. Local
 * preview only; nothing here is a real business.
 */
import { buildPolicyView, type PolicyRows } from "@/platform/needs-you/policy-model";
import type { NotToldRow } from "@/platform/needs-you/policy";
import type { BusinessPolicy, OperatorLoad } from "@/app/admin/needs-you/data";

const MOONEY = "a0000000-0000-4000-8000-000000000001";
const TWIN = "a0000000-0000-4000-8000-000000000002";

const ROWS: PolicyRows = {
  settings: [
    { layer: "strelva", kind: "copy.routine", systemId: null, route: "handle_after_notice", version: 2, reason: "earned_trust", updatedAt: "2026-10-01T15:00:00Z" },
    { layer: "owner", kind: "google.post", systemId: null, route: "owner_decides", version: 1, reason: "owner_setting", updatedAt: "2026-10-05T15:00:00Z" },
    { layer: "owner", kind: "review.reply", systemId: null, route: "owner_decides", version: 1, reason: "seed", updatedAt: "2026-10-05T15:00:00Z" },
  ],
  history: [],
};

export type PreviewState = "ready" | "empty" | "denied" | "error" | "off";

export function previewState(value: string | undefined): PreviewState {
  return value === "empty" || value === "denied" || value === "error" || value === "off" ? value : "ready";
}

export function policyPreview(state: PreviewState, workspaceId: string | undefined): OperatorLoad<BusinessPolicy> {
  if (state === "off") return { state: "off" };
  if (state === "denied") return { state: "denied" };
  if (state === "error") return { state: "unavailable", message: "The policy could not be read. Nothing changed: try again." };
  if (state === "empty") return { state: "ready", value: { businesses: [], selected: null } };
  const businesses = [
    { id: MOONEY, name: "The Mooney Firm", strelvaRows: 1, ownerRows: 2 },
    { id: TWIN, name: "Twin Trees Camillus", strelvaRows: 0, ownerRows: 0 },
  ];
  const chosen = businesses.find(business => business.id === (workspaceId ?? MOONEY));
  return { state: "ready", value: { businesses, selected: chosen ? { id: chosen.id, name: chosen.name, view: buildPolicyView(chosen.id === MOONEY ? ROWS : { settings: [], history: [] }) } : null } };
}

const base = (over: Partial<NotToldRow>): NotToldRow => ({
  id: "d0000000-0000-4000-8000-000000000001", workspaceId: MOONEY, businessName: "The Mooney Firm", kind: "system.go_live",
  title: "Put the consult booking page live on attymooney.com", state: "open", deliveryState: "suppressed",
  openedAt: "2026-10-03T11:00:00Z", expiresAt: "2026-10-17T11:00:00Z", decidedAt: null, recipientKnown: true,
  lastDelivery: { kind: "digest", status: "suppressed", reason: "email_suppressed_or_unconfigured", at: "2026-10-04T11:00:00Z" }, ...over,
});

export function notToldPreview(state: PreviewState): OperatorLoad<NotToldRow[]> {
  if (state === "off") return { state: "off" };
  if (state === "denied") return { state: "denied" };
  if (state === "error") return { state: "unavailable", message: "The owner-not-told list could not be read. Nothing is hidden: try again." };
  if (state === "empty") return { state: "ready", value: [] };
  return { state: "ready", value: [
    base({}),
    base({ id: "d0000000-0000-4000-8000-000000000002", title: "Reply to Jordan's mediation inquiry, quoting the consult fee", kind: "customer.commitment", deliveryState: "bounced",
      lastDelivery: { kind: "urgent", status: "bounced", reason: "mailbox_full", at: "2026-10-05T09:12:00Z" } }),
    base({ id: "d0000000-0000-4000-8000-000000000003", workspaceId: TWIN, businessName: "Twin Trees Camillus", title: "Change the Friday hours on Google to 11 to 10", kind: "fact.inferred",
      deliveryState: "not_sent", recipientKnown: false, lastDelivery: null }),
    base({ id: "d0000000-0000-4000-8000-000000000004", title: "Post this week's mediation tip on Google", kind: "google.post", state: "expired", decidedAt: "2026-10-06T07:00:00Z", openedAt: "2026-09-22T07:00:00Z" }),
  ] };
}
