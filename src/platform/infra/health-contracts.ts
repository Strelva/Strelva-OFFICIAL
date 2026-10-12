export type ServiceStatus = "ok" | "not configured" | "error";

export interface ServiceCheck {
  status: ServiceStatus;
  responseMs: number;
}

export interface HealthReport {
  status: "healthy" | "degraded" | "down";
  version: string;
  timestamp: string;
  checks: {
    redis: ServiceCheck;
    supabase: ServiceCheck;
    stripe: ServiceCheck;
    gemini: ServiceCheck;
  };
}
