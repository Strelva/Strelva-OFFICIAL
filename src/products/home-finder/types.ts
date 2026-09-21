/**
 * The Customers platform owns the narrow management port. The Home Finder
 * product implements it and adds transport-specific errors and options here.
 */
export {
  HOME_FINDER_MANAGEMENT_OPERATIONS,
  HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
} from "@/platform/customers/home-finder-port";
export type {
  HomeFinderDeliveryDetail,
  HomeFinderDeliveryPage,
  HomeFinderDeliveryState,
  HomeFinderDeliverySummary,
  HomeFinderInstallationScope,
  HomeFinderInstallationSummary,
  HomeFinderManagementOperation,
  HomeFinderReadiness,
  HomeFinderReadinessItem,
  HomeFinderReadinessState,
  HomeFinderReadOptions,
  HomeFinderReceiptListOptions,
} from "@/platform/customers/home-finder-port";

export type HomeFinderAdapterErrorCode =
  | "invalid_scope"
  | "invalid_request"
  | "timeout"
  | "response_too_large"
  | "schema_mismatch"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "source_unavailable"
  | "rate_limited";

export type HomeFinderAdapterErrorOptions = {
  status?: number;
  retryable?: boolean;
  cause?: unknown;
};

export class HomeFinderAdapterError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    readonly code: HomeFinderAdapterErrorCode,
    message: string,
    options: HomeFinderAdapterErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "HomeFinderAdapterError";
    this.status = options.status ?? 503;
    this.retryable = options.retryable ?? false;
  }
}

export type HomeFinderServerAdapterOptions = {
  /** HTTPS origin for IDX. A local HTTP origin is permitted in tests only. */
  baseUrl: string;
  /** Dedicated management HMAC key; never use INQUIRY_WORKER_SECRET here. */
  signingKey: string | Uint8Array;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxResponseBytes?: number;
};
