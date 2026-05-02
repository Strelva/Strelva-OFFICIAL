type Severity = "low" | "medium" | "high" | "critical";

interface Context {
  [key: string]: unknown;
}

const SENTRY_DSN = process.env.SENTRY_DSN;

export function trackError(error: unknown, context: Context = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[monitoring:error]", message, { ...context, stack });

  if (SENTRY_DSN) {
    // Wire @sentry/nextjs here when the project DSN is provisioned.
  }
}

export function alert(event: string, severity: Severity, context: Context = {}): void {
  console.error(`[monitoring:alert:${severity}] ${event}`, context);

  if (SENTRY_DSN && (severity === "high" || severity === "critical")) {
    // Wire @sentry/nextjs captureMessage here when the project DSN is provisioned.
  }
}
