/**
 * Platform-owned port for an authorized Home Finder management reader.
 * The Customers domain depends on this shape, while a product adapter is
 * supplied by the server composition root.
 */

export const HOME_FINDER_MANAGEMENT_SCHEMA_VERSION = "1" as const;

export const HOME_FINDER_MANAGEMENT_OPERATIONS = [
  "readInstallationSummary",
  "readReadiness",
  "listDeliveryReceipts",
  "readDeliveryReceipt",
] as const;

export type HomeFinderManagementOperation =
  (typeof HOME_FINDER_MANAGEMENT_OPERATIONS)[number];

export type HomeFinderInstallationScope = Readonly<{
  installationId: string;
  managementReads: readonly HomeFinderManagementOperation[];
}>;

export type HomeFinderReadinessState =
  | "confirmed"
  | "missing"
  | "unverified"
  | "stale";

export type HomeFinderReadinessItem = {
  requirement: string;
  state: HomeFinderReadinessState;
  source: string;
  observedAt: string;
  responsibleParty: string;
};

export type HomeFinderInstallationSummary = {
  schemaVersion: typeof HOME_FINDER_MANAGEMENT_SCHEMA_VERSION;
  id: string;
  brokerageName: string;
  mode: "demo" | "live";
  approvedOrigin?: string;
  previewHref: string;
  observedAt: string;
  readiness: HomeFinderReadinessItem[];
};

export type HomeFinderReadiness = {
  schemaVersion: typeof HOME_FINDER_MANAGEMENT_SCHEMA_VERSION;
  installationId: string;
  observedAt: string;
  readiness: HomeFinderReadinessItem[];
};

export type HomeFinderDeliveryState =
  | "pending"
  | "delivered"
  | "bounced"
  | "failed";

export type HomeFinderDeliverySummary = {
  reference: string;
  state: HomeFinderDeliveryState;
  occurredAt: string;
  expiresAt: string;
};

export type HomeFinderDeliveryPage = {
  schemaVersion: typeof HOME_FINDER_MANAGEMENT_SCHEMA_VERSION;
  installationId: string;
  observedAt: string;
  items: HomeFinderDeliverySummary[];
  nextCursor?: string;
};

export type HomeFinderDeliveryDetail = HomeFinderDeliverySummary & {
  schemaVersion: typeof HOME_FINDER_MANAGEMENT_SCHEMA_VERSION;
  installationId: string;
  observedAt: string;
};

export type HomeFinderReceiptListOptions = {
  cursor?: string;
  limit?: number;
  correlationId?: string;
};

export type HomeFinderReadOptions = {
  correlationId?: string;
};

export interface HomeFinderManagementReader {
  readInstallationSummary(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderInstallationSummary>;
  readReadiness(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderReadiness>;
  listDeliveryReceipts(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReceiptListOptions,
  ): Promise<HomeFinderDeliveryPage>;
  readDeliveryReceipt(
    scope: HomeFinderInstallationScope,
    reference: string,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderDeliveryDetail>;
}
