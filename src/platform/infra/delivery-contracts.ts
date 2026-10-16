export type DeliveryStatus =
  | "received"
  | "reviewing"
  | "drafting"
  | "owner_review"
  | "launch_ready"
  | "launched"
  | "paused";

export type DeliveryPlan = "one-time" | "monthly";

export interface DeliveryLead {
  businessName: string;
  /** Absent only on historical records or intake before configuration. */
  agencyWorkspaceId?: string | null;
  /** The serving agency's display name when the intake recorded it. The page prefers a live brand read. */
  agencyName?: string | null;
  /** Absent on legacy website-sales records. Account access is never sales. */
  requestType?: string;
  conversion?: { idempotencyKey: string; actorId: string; fingerprint: string; input: Record<string, unknown>; businessWorkspaceId?: string };
  description?: string | null;
  location?: string | null;
  email: string;
  phone?: string | null;
  currentWebsite?: string | null;
  plan?: DeliveryPlan | null;
  referredBy?: string | null;
  statusToken: string;
  deliveryStatus: DeliveryStatus;
  submittedAt: string;
  /** When the status last changed. A legacy record without one reads back as `submittedAt`, never as now. */
  statusUpdatedAt: string;
  /** An https link to the draft for the person who asked, when the agency added one. The status page shows "See the draft". */
  draftUrl?: string | null;
}

export const deliverySteps: Array<{
  id: Exclude<DeliveryStatus, "paused">;
  label: string;
  detail: string;
}> = [
  {
    id: "received",
    label: "Request received",
    detail: "Your business, current site, and build request are in the queue. We will follow up after review.",
  },
  {
    id: "reviewing",
    label: "Checking it's a fit",
    detail: "We check the business, the customer path, and what the site should prove.",
  },
  {
    id: "drafting",
    label: "Site draft",
    detail: "Your site gets built around calls, bookings, trust, and easy updates.",
  },
  {
    id: "owner_review",
    label: "Owner review",
    detail: "You get the draft before anything publishes.",
  },
  {
    id: "launch_ready",
    label: "Ready to launch",
    detail: "Domains, handoff, and the first proof loop are prepared.",
  },
  {
    id: "launched",
    label: "Live",
    detail: "Your site and weekly proof loop are running.",
  },
];

/** Every delivery stage the operator can set, in customer-facing order. The six
 *  `deliverySteps` plus the off-track `paused` state. */
export const DELIVERY_STATUSES: DeliveryStatus[] = [
  ...deliverySteps.map((s) => s.id),
  "paused",
];

/** The customer-facing label for a delivery stage (matches the tracker page). */
export function deliveryStatusLabel(status: DeliveryStatus): string {
  if (status === "paused") return "Paused";
  return deliverySteps.find((s) => s.id === status)?.label ?? "Request received";
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (DELIVERY_STATUSES as string[]).includes(value);
}

export function normalizeDeliveryStatus(value: unknown): DeliveryStatus {
  if (
    value === "received" ||
    value === "reviewing" ||
    value === "drafting" ||
    value === "owner_review" ||
    value === "launch_ready" ||
    value === "launched" ||
    value === "paused"
  ) {
    return value;
  }
  if (value === "contacted" || value === "qualified") return "reviewing";
  if (value === "converted") return "launched";
  if (value === "lost") return "paused";
  return "received";
}

export function getDeliveryStepIndex(status: DeliveryStatus): number {
  if (status === "paused") return 0;
  const index = deliverySteps.findIndex((step) => step.id === status);
  return index >= 0 ? index : 0;
}
