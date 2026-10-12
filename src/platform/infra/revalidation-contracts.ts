export interface RevalidationFailure {
  tenantId: string;
  url: string;
  error: string;
  timestamp: string;
  attempts: number;
}
