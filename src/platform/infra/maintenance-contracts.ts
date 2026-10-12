export type MaintenanceItemType = "content" | "health";

export interface MaintenanceDigestItem {
  id: string;
  type: MaintenanceItemType;
  title: string;
  detail: string;
  /** A chat prompt the AI can run to do the work, once approved. */
  action: string;
}

export type DigestStatus = "pending" | "approved" | "dismissed";

export interface MaintenanceDigest {
  tenant: string;
  siteName: string;
  weekOf: string;
  items: MaintenanceDigestItem[];
  status: DigestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}
