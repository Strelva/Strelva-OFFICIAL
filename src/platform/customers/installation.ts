import type {
  HomeFinderDeliveryDetail,
  HomeFinderDeliveryPage,
  HomeFinderInstallationSummary,
  HomeFinderReadiness,
} from "./home-finder-port";

/** The only browser-addressable management views in the initial slice. */
export const CUSTOMER_INSTALLATION_VIEWS = [
  "summary",
  "readiness",
  "receipts",
  "receipt",
] as const;

export type CustomerInstallationView = (typeof CUSTOMER_INSTALLATION_VIEWS)[number];

export type CustomerInstallationSummaryResponse = {
  organizationId: string;
  customerId: string;
  resourceId: string;
  installation: HomeFinderInstallationSummary;
};

export type CustomerInstallationReadinessResponse = {
  organizationId: string;
  customerId: string;
  resourceId: string;
  installation: HomeFinderReadiness;
};

export type CustomerInstallationReceiptsResponse = {
  organizationId: string;
  customerId: string;
  resourceId: string;
  installation: HomeFinderDeliveryPage;
};

export type CustomerInstallationReceiptResponse = {
  organizationId: string;
  customerId: string;
  resourceId: string;
  installation: HomeFinderDeliveryDetail;
};

export type CustomerInstallationResponse =
  | CustomerInstallationSummaryResponse
  | CustomerInstallationReadinessResponse
  | CustomerInstallationReceiptsResponse
  | CustomerInstallationReceiptResponse;
