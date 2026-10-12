import type { RevalidationFailure } from "./revalidation-contracts";

/** One domain-drift finding, carrying the tenant so the ops board can deep-link it. */
export interface DomainDriftItem {
  tenantId: string;
  message: string;
}

export interface FailedAiWriteItem {
  tenantId: string;
  title: string;
  error: string;
}

export interface OpsMetrics {
  webhookFailures: number;
  revalidationFailures: number;
  pendingEvents: Record<string, number>;
  totalPendingEvents: number;
  failedAiWrites: number;
  /** Failed AI write events, for the drilldown list. */
  failedAiWriteItems?: FailedAiWriteItem[];
  /** Human-readable drift lines (kept for the count + attention feed). */
  tenantDomainDrift: string[];
  /** Same drift, structured so each row links into `/admin/clients/[id]`. Always
   * populated by `buildOpsReport`; optional so existing snapshot fixtures stay valid. */
  domainDrift?: DomainDriftItem[];
}

export interface OpsReport {
  timestamp: string;
  activeTenants: number;
  metrics: OpsMetrics;
  /** Most recent revalidation failures (capped) for display. */
  revalidationFailures: RevalidationFailure[];
}
