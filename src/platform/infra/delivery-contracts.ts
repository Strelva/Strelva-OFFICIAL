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
  statusUpdatedAt: string;
}
