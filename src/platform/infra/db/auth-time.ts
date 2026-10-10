/** Call only after getClaims verified the signature and getUser verified the
 * same subject. Supabase supplies credential times in AMR; token issuance or
 * refresh is not a new sign-in. The caller still enforces the freshness window. */
export function verifiedSignInTime(claims: Record<string, unknown>, userId: string): number | null {
  if (claims.sub !== userId) return null;
  const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (Object.hasOwn(claims, "auth_time")) return timestamp(claims.auth_time) ? claims.auth_time : null;
  if (!Array.isArray(claims.amr)) return null;
  const credentialMethods = new Set(["password", "oauth", "otp", "totp", "magiclink", "sso/saml"]);
  const times = claims.amr.flatMap(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { method, timestamp: at } = entry as Record<string, unknown>;
    return typeof method === "string" && credentialMethods.has(method) && timestamp(at) ? [at] : [];
  });
  return times.length ? Math.max(...times) : null;
}

export function freshSignIn(authTime: number | null, now: Date): boolean {
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) return false;
  const ageSeconds = now.getTime() / 1000 - authTime;
  return ageSeconds >= 0 && ageSeconds <= 10 * 60;
}
