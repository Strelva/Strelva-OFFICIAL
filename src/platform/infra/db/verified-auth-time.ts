/**
 * Authentication time from claims already verified by Supabase getClaims.
 * Supabase's normal user JWTs carry amr, not OIDC auth_time:
 * https://supabase.com/docs/guides/auth/jwt-fields
 * Never use iat, a refresh, recovery or account-change event for step-up.
 * The caller retains the action's existing maximum authentication age.
 */
export function verifiedAuthenticationTime(claims: unknown, now = Math.floor(Date.now() / 1000)): number | null {
  if (!claims || typeof claims !== "object") return null;
  const value = claims as Record<string, unknown>;
  const valid = (timestamp: unknown): timestamp is number => typeof timestamp === "number"
    && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now;
  if (value.auth_time !== undefined) return valid(value.auth_time) ? value.auth_time : null;
  if (!Array.isArray(value.amr)) return null;
  const methods = new Set(["password", "oauth", "otp", "magiclink"]);
  let latest: number | null = null;
  for (const entry of value.amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as Record<string, unknown>;
    if (typeof method !== "string" || !methods.has(method) || !valid(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}
