import crypto from "crypto";
import type { SearchData, TenantConfig } from "./types";
import type { AutomationPolicy } from "./tenant/models";
import { getRedis } from "./redis";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** Read-only Search Console scope — the default for the shared JWT signer. */
export const SCOPE_WEBMASTERS = "https://www.googleapis.com/auth/webmasters.readonly";

function getSearchConsoleKey(tenantConfig?: AutomationPolicy | null): string | null {
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
 *
 * Tokens are cached in Redis (key: `reb:gcp-token:{hash(client_email)}:{hash(scope)}`,
 * TTL: 3500s) to avoid a token-exchange round trip on every analytics read. A
 * cache miss mints and stores; a hit returns immediately. The 3500s TTL leaves a
 * 100-second buffer before Google's 3600s expiry. Since the service-account
 * credential is platform-wide (one GOOGLE_SEARCH_CONSOLE_KEY), a single cached
 * token serves all tenants that fall back to the service account.
 */
export async function getAccessToken(
  key: ServiceAccountKey,
  scope: string = SCOPE_WEBMASTERS
): Promise<string> {
  // Redis cache look-up (best-effort — a miss or Redis-down just mints fresh).
  const redis = getRedis();
  if (redis) {
    try {
      const emailHash = crypto.createHash("sha256").update(key.client_email).digest("hex").slice(0, 16);
      const scopeHash = crypto.createHash("sha256").update(scope).digest("hex").slice(0, 8);
      const cacheKey = `reb:gcp-token:${emailHash}:${scopeHash}`;
      const cached = await redis.get<string>(cacheKey);
      if (cached) return cached;

      const token = await mintAccessToken(key, scope);
      // TTL: 3500s (100s buffer before Google's 3600s expiry).
      await redis.set(cacheKey, token, { ex: 3500 });
      return token;
    } catch {
      // Redis unavailable or cache write failed — fall through to a fresh mint.
    }
  }

  return mintAccessToken(key, scope);
}

/** Internal: mint a Google OAuth access token via RS256 JWT assertion. */
async function mintAccessToken(
  key: ServiceAccountKey,
  scope: string
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

export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => Number(v) || 0;

/**
 * The two-request Search Analytics read shared by BOTH GSC readers — the
 * dashboard perf reader (`analytics.getSearchConsolePerf`) and the cron
 * `fetchSearchData` below. One un-dimensioned request yields the TRUE property
 * totals (summing the top-20 query rows understates any long tail); a second
 * dimensioned request yields the top-20 query list for display. Totals come from
 * the aggregate row, falling back to the query-row sum only if that read is
 * empty. Returns null on any non-ok response — callers map that to their own
 * empty/unavailable shape. The caller supplies the resolved property + bearer
 * token (each reader has its own auth strategy), so this is purely the
 * query+parse that previously lived, drift-prone, in two places (Track B had to
 * edit both copies identically — this centralizes it).
 */
export async function queryGscTotals(
  property: string,
  token: string,
  startDate: string,
  endDate: string,
): Promise<GscTotals | null> {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/searchAnalytics/query`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [totalsRes, queriesRes] = await Promise.all([
    fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ startDate, endDate }) }),
    fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 20 }),
    }),
  ]);
  if (!totalsRes.ok || !queriesRes.ok) {
    const failed = !totalsRes.ok ? totalsRes : queriesRes;
    console.error(`Search Console API error: ${failed.status} ${await failed.text()}`);
    return null;
  }

  const totalsData = await totalsRes.json();
  const queriesData = await queriesRes.json();
  const queryRows: { keys: string[]; clicks: number; impressions: number; position: number }[] =
    queriesData.rows || [];
  const topQueries = queryRows.map((r) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    position: round1(r.position),
  }));

  const totalRow: { clicks?: number; impressions?: number; ctr?: number; position?: number } | undefined =
    totalsData.rows?.[0];
  const clicks = totalRow ? num(totalRow.clicks) : queryRows.reduce((s, r) => s + r.clicks, 0);
  const impressions = totalRow ? num(totalRow.impressions) : queryRows.reduce((s, r) => s + r.impressions, 0);
  const ctr = totalRow
    ? Math.round(num(totalRow.ctr) * 10000) / 10000
    : impressions > 0
      ? Math.round((clicks / impressions) * 10000) / 10000
      : 0;
  const position = totalRow
    ? round1(num(totalRow.position))
    : impressions > 0
      ? round1(queryRows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions)
      : 0;

  return { clicks, impressions, ctr, position, topQueries };
}

export async function fetchSearchData(
  siteUrl: string,
  days = 7,
  tenantConfig?: TenantConfig | null
): Promise<SearchData> {
  const key = getServiceAccountCredential(tenantConfig);
  if (!key) return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };

  try {
    const token = await getAccessToken(key);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const totals = await queryGscTotals(
      siteUrl,
      token,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    );
    if (!totals) return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };

    return {
      queries: totals.topQueries,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Search Console fetch failed:", err);
    return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
  }
}
