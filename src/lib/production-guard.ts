/**
 * Production runtime guards.
 * These ensure critical dependencies fail loudly in production rather than silently degrading.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Throws if a required dependency is not configured in production.
 * In development, logs a warning but continues.
 */
export function requireProductionDependency(name: string, configured: boolean): void {
  if (!configured) {
    if (isProduction) {
      throw new Error(`[PRODUCTION] ${name} is required but not configured`);
    } else {
      console.warn(`[DEV] ${name} not configured — using fallback`);
    }
  }
}

/**
 * Returns true only in production environment.
 */
export function isProductionEnv(): boolean {
  return isProduction;
}

/**
 * Asserts we're not using dev fallbacks in production.
 * Call this when about to use a dev-only fallback path.
 */
export function assertNotProductionFallback(fallbackName: string): void {
  if (isProduction) {
    throw new Error(
      `[PRODUCTION] Attempted to use development fallback: ${fallbackName}. ` +
      `This is not allowed in production.`
    );
  }
}
