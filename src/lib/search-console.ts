import crypto from "crypto";
import type { SearchData, TenantConfig } from "./types";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** Read-only Search Console scope — the default for the shared JWT signer. */
export const SCOPE_WEBMASTERS = "https://www.googleapis.com/auth/webmasters.readonly";

function getSearchConsoleKey(tenantConfig?: TenantConfig | null): string | null {
  // Tenant-level config takes priority
  if (tenantConfig?.googleSearchConsoleKey) {
    return tenantConfig.googleSearchConsoleKey;
  }
  // Fall back to platform env var
  return process.env.GOOGLE_SEARCH_CONSOLE_KEY || null;
}

/**
 * Resolve + parse the Google service-account credential for a tenant (or the
 * platform default). Returns null when unset or unparseable — never throws.
 * Shared by GSC (search-console) and GA4 (analytics) so both read one credential.
 */
export function getServiceAccountCredential(
  tenantConfig?: TenantConfig | null
): ServiceAccountKey | null {
  const keyJson = getSearchConsoleKey(tenantConfig);
  if (!keyJson) return null;
  try {
    const key = JSON.parse(keyJson) as ServiceAccountKey;
    if (!key.client_email || !key.private_key) return null;
    return key;
  } catch {
    console.error("Failed to parse Google service-account key");
    return null;
  }
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Mint a short-lived Google OAuth access token from a service-account key via a
 * signed RS256 JWT. Exported + scope-parameterized so GSC and GA4 share one
 * signer (GA4 passes the analytics.readonly scope). Defaults to the GSC scope.
 */
export async function getAccessToken(
  key: ServiceAccountKey,
  scope: string = SCOPE_WEBMASTERS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = base64url(sign.sign(key.private_key));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

const EMPTY_DATA: SearchData = {
  queries: [],
  totalClicks: 0,
  totalImpressions: 0,
  fetchedAt: new Date().toISOString(),
};

export async function fetchSearchData(
  siteUrl: string,
  days = 7,
  tenantConfig?: TenantConfig | null
): Promise<SearchData> {
  const key = getServiceAccountCredential(tenantConfig);
  if (!key) return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };

  try {
    const token = await getAccessToken(key);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const encodedUrl = encodeURIComponent(siteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          dimensions: ["query"],
          rowLimit: 20,
        }),
      },
    );

    if (!res.ok) {
      console.error(`Search Console API error: ${res.status} ${await res.text()}`);
      return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
    }

    const data = await res.json();
    const rows = data.rows || [];

    const queries = rows.map((row: { keys: string[]; clicks: number; impressions: number; position: number }) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      position: Math.round(row.position * 10) / 10,
    }));

    const totalClicks = queries.reduce((sum: number, q: { clicks: number }) => sum + q.clicks, 0);
    const totalImpressions = queries.reduce((sum: number, q: { impressions: number }) => sum + q.impressions, 0);

    return {
      queries,
      totalClicks,
      totalImpressions,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Search Console fetch failed:", err);
    return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
  }
}
