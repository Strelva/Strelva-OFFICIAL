const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Read-only Search Console scope requested by /api/oauth/google. */
export const GSC_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Read-only GA4 (Analytics Data API) scope requested by /api/oauth/google. */
export const GA4_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface RefreshedGoogleTokens {
  accessToken: string;
  /** Seconds until the access token expires, when Google said. */
  expiresIn: number | null;
  /** Google does not usually rotate here; when it does, the caller stores it. */
  refreshToken: string | null;
}

export type GoogleRefreshOutcome =
  | { ok: true; tokens: RefreshedGoogleTokens }
  | { ok: false; reason: "unconfigured" | "invalid_grant" | "rejected" | "network" };

/**
 * Mint a fresh access token from a refresh token via the refresh_token grant,
 * keeping a rotated refresh token if Google returns one, and telling a dead
 * grant (`invalid_grant`: revoked, expired, or minted for a Testing-status
 * app more than 7 days ago) apart from a transient failure.
 */
export async function refreshGoogleTokens(refreshToken: string): Promise<GoogleRefreshOutcome> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      return { ok: false, reason: body.includes("invalid_grant") ? "invalid_grant" : "rejected" };
    }
    const data = await res.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
    if (typeof data.access_token !== "string" || !data.access_token) return { ok: false, reason: "rejected" };
    return {
      ok: true,
      tokens: {
        accessToken: data.access_token,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
        refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
      },
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

