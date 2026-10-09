/** Shared point-in-time domain evidence; no tenant or workspace store dependency. */
export type DomainState = "up" | "down" | "parked" | "unreachable" | "unknown";

/** A monitorable hostname belonging to a tenant. */
export type DomainKind = "custom" | "platform";

export interface DomainCheck {
  host: string;
  kind: DomainKind;
  url: string;
  httpStatus: number | null;
  bytes: number | null;
  state: DomainState;
  reason?: string;
  /** Registry expiry (ISO date) from RDAP, or null when unavailable. */
  expiresAt: string | null;
  daysToExpiry: number | null;
  /** Optional so stored scans predating certificate checks remain readable. */
  sslExpiresAt?: string | null;
  sslDaysToExpiry?: number | null;
  checkedAt: string;
  latencyMs: number | null;
}

export interface TenantDomainHealth {
  tenantId: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  primaryHost: string | null;
  checks: DomainCheck[];
  /** Worst state across the tenant's CUSTOM domains (falls back to platform). */
  worst: DomainState;
  /** Nearest expiry (days) across all checks, or null. */
  nearestExpiryDays: number | null;
}
