/**
 * Production runtime guards.
 * These ensure critical dependencies fail loudly in production rather than silently degrading.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Returns true only in production environment.
 */
export function isProductionEnv(): boolean {
  return isProduction;
}
