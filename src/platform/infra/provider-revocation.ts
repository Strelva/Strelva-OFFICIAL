/** Best-effort provider authorization revocation. Never includes credentials in
 * the result or error code; callers persist this safe outcome as a receipt. */
export type DisconnectProvider = "google" | "instagram" | "yelp" | "calendly" | "vegaro" | "outlook";

export type RevocationOutcome =
  | "revoked"
  | "already_revoked"
  | "failed"
  | "partial_failure"
  | "unsupported"
  | "consent_remains"
  | "no_token"
  | "not_attempted";

export interface ProviderRevocationResult {
  outcome: RevocationOutcome;
  errorCode: string | null;
}

export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const noRequest = (outcome: RevocationOutcome): ProviderRevocationResult => ({ outcome, errorCode: null });
const failed = (errorCode: string): ProviderRevocationResult => ({ outcome: "failed", errorCode });

function responseErrorCode(status: number): string {
  return `http_${status}`;
}

async function revokeGoogle(token: string, fetcher: ProviderFetch): Promise<ProviderRevocationResult> {
  try {
    const response = await fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? noRequest("revoked") : failed(responseErrorCode(response.status));
  } catch {
    return failed("request_failed");
  }
}

async function revokeCalendly(token: string, fetcher: ProviderFetch): Promise<ProviderRevocationResult> {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return failed("revocation_not_configured");
  try {
    const response = await fetcher("https://auth.calendly.com/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? noRequest("revoked") : failed(responseErrorCode(response.status));
  } catch {
    return failed("request_failed");
  }
}

/**
 * Revoke a provider grant when that provider offers a supported endpoint.
 * Microsoft calendar consent remains until the owner removes it in My Apps;
 * the existing UI action links to that documented exception. Yelp uses a
 * customer-managed API key, Vagaro has no supported per-token endpoint, and
 * this application's Instagram grant uses the retired Basic Display flow,
 * which has no supported app-initiated token revocation endpoint.
 */
export async function revokeProviderAuthorization(
  provider: DisconnectProvider,
  token: string | null | undefined,
  fetcher: ProviderFetch = fetch,
): Promise<ProviderRevocationResult> {
  if (provider === "outlook") return noRequest("consent_remains");
  if (provider === "yelp" || provider === "vegaro" || provider === "instagram") return noRequest("unsupported");
  if (!token?.trim()) return noRequest("no_token");
  if (provider === "google") return revokeGoogle(token, fetcher);
  return revokeCalendly(token, fetcher);
}
