/**
 * Search Console + GA4 analytics data layer.
 *
 * Two things live here:
 *  1. Per-tenant analytics config (which GSC property + GA4 property to read),
 *     stored in Redis at `analytics:cfg:{tenantId}`, degrading to sensible
 *     defaults (GSC property derived from the tenant's siteUrl) without Redis.
 *  2. Fail-soft performance reads for both surfaces. Every read returns a
 *     status ("ok" | "unconfigured" | "unavailable") and never throws:
 *       - "unconfigured" when the tenant has no property to read,
 *       - "unavailable" on any auth/API failure (zeroed fields),
 *       - "ok" otherwise.
 *
 * Auth is OAuth-first, service-account-fallback. Each read tries the tenant's
 * own Google connection (the "Connect Google" button) when they granted the
 * matching read scope — the token is minted from that connection's refresh
 * grant. If the tenant has no connection, didn't grant the scope (e.g. connected
 * before the scope was added and hasn't reconnected), or the refresh fails, the
 * read falls back to the shared Strelva reporting service account. When neither
 * path yields a token the read returns "unavailable" — it never throws.
 *
 * Credential + JWT signing for the service-account path are reused from
 * `search-console.ts` (getServiceAccountCredential + getAccessToken) so GSC and
 * GA4 share one service-account credential and one RS256 signer.
 *
 * NOTE: the service-account fallback requires the Strelva reporting service
 * account (strelva-reporting@strelva.iam.gserviceaccount.com) to be added as a
 * user on each client's GSC + GA4 property. The OAuth path needs no such grant —
 * it reads as the client themselves.
 */

import { getRedis } from "./redis";
import { getTenantConfig } from "./tenants";
import { getAccessToken, getServiceAccountCredential } from "./search-console";
import { getGoogleAccessToken, getGoogleScopeGrants } from "./google-token";
import type { TenantConfig } from "./types";

/** GA4 Data API read scope for the shared JWT signer. */
const SCOPE_ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";
/** Search Console read-WRITE scope — required by the Sites: add call. The
 *  read paths above only ever use the read-only scope. */
const SCOPE_WEBMASTERS_WRITE = "https://www.googleapis.com/auth/webmasters";

export interface TenantAnalyticsConfig {
  tenantId: string;
  gscProperty: string | null;
  ga4PropertyId: string | null;
  updatedAt: string | null;
}

export type AnalyticsStatus = "ok" | "unconfigured" | "unavailable";

export interface SearchPerf {
  status: AnalyticsStatus;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

export interface GaPerf {
  status: AnalyticsStatus;
  users: number;
  sessions: number;
  pageviews: number;
  topPages: { path: string; views: number }[];
  topSources: { source: string; sessions: number }[];
}

interface StoredConfig {
  gscProperty: string | null;
  ga4PropertyId: string | null;
  updatedAt: string | null;
}

const cfgKey = (tenantId: string) => `analytics:cfg:${tenantId}`;

/** Derive a GSC domain property (`sc-domain:example.com`) from a site URL.
 *  Exported so the provisioning path can persist the same default it would read. */
export function deriveScDomain(siteUrl?: string | null): string | null {
  if (!siteUrl) return null;
  try {
    const url = new URL(siteUrl.includes("://") ? siteUrl : `https://${siteUrl}`);
    const host = url.hostname.replace(/^www\./, "");
    return host ? `sc-domain:${host}` : null;
  } catch {
    return null;
  }
}

async function readStored(tenantId: string): Promise<StoredConfig | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<StoredConfig>(cfgKey(tenantId));
    return raw ?? null;
  } catch {
    return null;
  }
}

/** Apply the siteUrl-derived GSC default when no property is stored. */
async function resolveConfig(
  tenantId: string,
  stored: StoredConfig | null
): Promise<TenantAnalyticsConfig> {
  let gscProperty = stored?.gscProperty ?? null;
  if (!gscProperty) {
    const tenant = await getTenantConfig(tenantId).catch(() => undefined);
    gscProperty = deriveScDomain(tenant?.siteUrl);
  }
  return {
    tenantId,
    gscProperty,
    ga4PropertyId: stored?.ga4PropertyId ?? null,
    updatedAt: stored?.updatedAt ?? null,
  };
}

export async function getAnalyticsConfig(tenantId: string): Promise<TenantAnalyticsConfig> {
  return resolveConfig(tenantId, await readStored(tenantId));
}

export async function setAnalyticsConfig(
  tenantId: string,
  patch: { gscProperty?: string | null; ga4PropertyId?: string | null }
): Promise<TenantAnalyticsConfig> {
  const current = await readStored(tenantId);
  const next: StoredConfig = {
    gscProperty:
      patch.gscProperty !== undefined ? patch.gscProperty : current?.gscProperty ?? null,
    ga4PropertyId:
      patch.ga4PropertyId !== undefined ? patch.ga4PropertyId : current?.ga4PropertyId ?? null,
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(cfgKey(tenantId), next);
    } catch {
      // Config store degrades to defaults without Redis — a failed write is not fatal.
    }
  }

  return resolveConfig(tenantId, next);
}

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => Number(v) || 0;

const EMPTY_SEARCH: Omit<SearchPerf, "status"> = {
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 0,
  topQueries: [],
};

const EMPTY_GA: Omit<GaPerf, "status"> = {
  users: 0,
  sessions: 0,
  pageviews: 0,
  topPages: [],
  topSources: [],
};

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

/**
 * Resolve a bearer token for a Google read surface: the tenant's own OAuth
 * token when they granted the matching scope, else the shared service account.
 * Returns null when neither is available (caller → "unavailable"). Only the
 * service-account exchange can throw; that propagates to the caller's catch.
 */
async function resolveGoogleToken(
  tenantId: string,
  surface: "gsc" | "ga4"
): Promise<string | null> {
  const grants = await getGoogleScopeGrants(tenantId);
  const granted = surface === "gsc" ? grants.hasGscScope : grants.hasGa4Scope;
  if (granted) {
    const oauthToken = await getGoogleAccessToken(tenantId);
    if (oauthToken) return oauthToken;
  }

  const tenant = await getTenantConfig(tenantId).catch(() => undefined);
  const cred = getServiceAccountCredential(tenant);
  if (!cred) return null;
  return surface === "gsc"
    ? getAccessToken(cred)
    : getAccessToken(cred, SCOPE_ANALYTICS);
}

export async function getSearchConsolePerf(tenantId: string, days = 28): Promise<SearchPerf> {
  const cfg = await getAnalyticsConfig(tenantId);
  if (!cfg.gscProperty) return { status: "unconfigured", ...EMPTY_SEARCH };

  try {
    const token = await resolveGoogleToken(tenantId, "gsc");
    if (!token) return { status: "unavailable", ...EMPTY_SEARCH };

    const { startDate, endDate } = dateRange(days);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        cfg.gscProperty
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 20 }),
      }
    );
    if (!res.ok) return { status: "unavailable", ...EMPTY_SEARCH };

    const data = await res.json();
    const rows: GscRow[] = data.rows || [];
    const topQueries = rows.map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: round1(r.position),
    }));
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 10000 : 0;
    // Impression-weighted average position across the returned queries.
    const position =
      impressions > 0
        ? round1(rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions)
        : 0;

    return { status: "ok", clicks, impressions, ctr, position, topQueries };
  } catch {
    return { status: "unavailable", ...EMPTY_SEARCH };
  }
}

export async function getGa4Perf(tenantId: string, days = 28): Promise<GaPerf> {
  const cfg = await getAnalyticsConfig(tenantId);
  if (!cfg.ga4PropertyId) return { status: "unconfigured", ...EMPTY_GA };

  try {
    const token = await resolveGoogleToken(tenantId, "ga4");
    if (!token) return { status: "unavailable", ...EMPTY_GA };

    const { startDate, endDate } = dateRange(days);
    const property = cfg.ga4PropertyId.startsWith("properties/")
      ? cfg.ga4PropertyId
      : `properties/${cfg.ga4PropertyId}`;

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${property}:batchRunReports`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              dateRanges: [{ startDate, endDate }],
              metrics: [
                { name: "activeUsers" },
                { name: "sessions" },
                { name: "screenPageViews" },
              ],
            },
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: "pagePath" }],
              metrics: [{ name: "screenPageViews" }],
              orderBys: [{ desc: true, metric: { metricName: "screenPageViews" } }],
              limit: 10,
            },
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: "sessionSource" }],
              metrics: [{ name: "sessions" }],
              orderBys: [{ desc: true, metric: { metricName: "sessions" } }],
              limit: 10,
            },
          ],
        }),
      }
    );
    if (!res.ok) return { status: "unavailable", ...EMPTY_GA };

    const data = await res.json();
    const reports = data.reports || [];
    const totals = reports[0]?.rows?.[0]?.metricValues || [];
    const topPages = (reports[1]?.rows || []).map(
      (r: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }) => ({
        path: r.dimensionValues?.[0]?.value ?? "",
        views: num(r.metricValues?.[0]?.value),
      })
    );
    const topSources = (reports[2]?.rows || []).map(
      (r: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }) => ({
        source: r.dimensionValues?.[0]?.value ?? "",
        sessions: num(r.metricValues?.[0]?.value),
      })
    );

    return {
      status: "ok",
      users: num(totals[0]?.value),
      sessions: num(totals[1]?.value),
      pageviews: num(totals[2]?.value),
      topPages,
      topSources,
    };
  } catch {
    return { status: "unavailable", ...EMPTY_GA };
  }
}

export interface GscRegistrationResult {
  status: "ok" | "skipped" | "unavailable" | "error";
  property: string | null;
  detail: string;
}

/**
 * GROUNDWORK — NOT auto-invoked anywhere. Registers a Strelva-hosted site with
 * the shared reporting service account's Search Console via the Sites: add API
 * (`PUT /webmasters/v3/sites/{property}`). Because we host the site we CAN grant
 * the reporting account access, but this call is deliberately left un-wired:
 *
 *   - It is GATED behind an explicit `opts.allow === true`. A default/stray call
 *     is a no-op ("skipped") and issues NO network request, so it can never fire
 *     a live Search Console write by accident.
 *   - It performs NO ownership verification and writes NO verification token, so
 *     it cannot produce a false "verified" state. The API only SUCCEEDS if the
 *     service account is already a verified owner of the property; otherwise
 *     Google rejects it and we surface "error" — we never fake success.
 *   - It requires the reporting service account's JWT to carry the read-WRITE
 *     `webmasters` scope (the read paths use `webmasters.readonly`).
 *
 * The supported, zero-risk way to grant read access remains the manual one-liner
 * (there is no public API to add another account as a *user* of a property you
 * own): in Search Console → Settings → Users and permissions, add
 *   strelva-reporting@strelva.iam.gserviceaccount.com
 * as a Full/Restricted user on the client's property. Provisioning surfaces this
 * as a manual step. Use this function only when you deliberately opt in and the
 * service account is already a verified owner. Never throws.
 */
export async function registerHostedSiteWithSearchConsole(
  tenant: TenantConfig | null | undefined,
  siteUrl: string,
  opts: { allow: boolean },
): Promise<GscRegistrationResult> {
  const property = deriveScDomain(siteUrl);
  if (!opts.allow) {
    return {
      status: "skipped",
      property,
      detail:
        "opt-in flag not set — no live Search Console call made (this is the safe default)",
    };
  }
  if (!property) {
    return { status: "error", property: null, detail: "could not derive a GSC property from siteUrl" };
  }
  const cred = getServiceAccountCredential(tenant);
  if (!cred) {
    return { status: "unavailable", property, detail: "no reporting service account configured" };
  }
  try {
    const token = await getAccessToken(cred, SCOPE_WEBMASTERS_WRITE);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return {
        status: "error",
        property,
        detail: `Sites: add rejected (${res.status}) — the service account is likely not a verified owner`,
      };
    }
    return { status: "ok", property, detail: `${property} added to the reporting service account` };
  } catch (err) {
    return {
      status: "error",
      property,
      detail: err instanceof Error ? err.message : "Sites: add failed",
    };
  }
}
