import { getConnection } from "./connections";
import { GA4_READ_SCOPE, GSC_READ_SCOPE, getGoogleAccessToken } from "./google-token";
import { getAnalyticsConfig, setAnalyticsConfig } from "./analytics";
import { getRedis } from "./redis";
import { GBP_WRITE_SCOPE } from "./gbp-replies";

const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const GA4_ACCOUNTS_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

const MAX_RESOURCES = 100;
const MAX_LABEL = 240;

export type GoogleResourceKind = "gsc" | "ga4" | "gbp";

export interface GoogleResource {
  id: string;
  label: string;
  detail?: string;
}

export interface GoogleResourceCatalog {
  connection: {
    connected: boolean;
    status: "connected" | "disconnected" | "needs_reauth" | "error";
    scopes: string[];
  };
  gsc: { status: "ready" | "unavailable" | "not_granted"; resources: GoogleResource[]; selected: string | null };
  ga4: { status: "ready" | "unavailable" | "not_granted"; resources: GoogleResource[]; selected: string | null };
  gbp: {
    status: "ready" | "unavailable" | "not_granted";
    resources: GoogleResource[];
    selected: { accountId: string; locationId: string } | null;
  };
}

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_LABEL) : fallback;
}

function resource(id: unknown, label: unknown, detail?: unknown): GoogleResource | null {
  const normalizedId = text(id);
  if (!normalizedId || normalizedId.length > 512) return null;
  const normalizedLabel = text(label, normalizedId);
  return {
    id: normalizedId,
    label: normalizedLabel || normalizedId,
    ...(text(detail) ? { detail: text(detail) } : {}),
  };
}

function uniqueResources(items: Array<GoogleResource | null>): GoogleResource[] {
  const seen = new Set<string>();
  const result: GoogleResource[] = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= MAX_RESOURCES) break;
  }
  return result;
}

async function getToken(tenantId: string): Promise<string | null> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return null;
  return getGoogleAccessToken(tenantId);
}

async function googleJson(url: string, token: string): Promise<JsonRecord | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : null;
  } catch {
    return null;
  }
}

async function listSearchConsoleResources(token: string): Promise<GoogleResource[] | null> {
  const body = await googleJson(GSC_SITES_URL, token);
  if (!body) return null;
  const entries = Array.isArray(body.siteEntry) ? body.siteEntry : [];
  return uniqueResources(entries.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as JsonRecord;
    return resource(row.siteUrl, row.siteUrl, row.permissionLevel);
  }));
}

async function listGa4Resources(token: string): Promise<GoogleResource[] | null> {
  const body = await googleJson(`${GA4_ACCOUNTS_URL}?pageSize=100`, token);
  if (!body) return null;
  const accounts = Array.isArray(body.accountSummaries) ? body.accountSummaries : [];
  const resources: Array<GoogleResource | null> = [];
  for (const account of accounts) {
    if (!account || typeof account !== "object") continue;
    const accountRow = account as JsonRecord;
    const accountLabel = text(accountRow.displayName, text(accountRow.name, "Google Analytics account"));
    const properties = Array.isArray(accountRow.propertySummaries) ? accountRow.propertySummaries : [];
    for (const property of properties) {
      if (!property || typeof property !== "object") continue;
      const propertyRow = property as JsonRecord;
      resources.push(resource(propertyRow.property, propertyRow.displayName, accountLabel));
    }
  }
  return uniqueResources(resources);
}

async function listGbpResources(token: string): Promise<GoogleResource[] | null> {
  const accountsBody = await googleJson(GBP_ACCOUNTS_URL, token);
  if (!accountsBody) return null;
  const accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
  const resources: Array<GoogleResource | null> = [];
  for (const account of accounts) {
    if (!account || typeof account !== "object") continue;
    const accountRow = account as JsonRecord;
    const accountId = text(accountRow.name);
    if (!accountId) continue;
    const locationsBody = await googleJson(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId.split("/").map(encodeURIComponent).join("/")}/locations?pageSize=100&readMask=name,title,storefrontAddress`,
      token,
    );
    if (!locationsBody) continue;
    const locations = Array.isArray(locationsBody.locations) ? locationsBody.locations : [];
    for (const location of locations) {
      if (!location || typeof location !== "object") continue;
      const locationRow = location as JsonRecord;
      const locationId = text(locationRow.name).split("/locations/")[1];
      if (!locationId) continue;
      const label = text(locationRow.title, `${accountRow.accountName ?? "Google Business"} location`);
      resources.push(resource(`${accountId}|${locationId}`, label, accountId));
    }
  }
  return uniqueResources(resources);
}

async function readSelectedGbp(tenantId: string): Promise<{ accountId: string; locationId: string } | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<{ accountId?: unknown; locationId?: unknown }>(`google-meta:${tenantId}`);
    if (typeof value?.accountId !== "string" || typeof value.locationId !== "string") return null;
    return { accountId: value.accountId, locationId: value.locationId };
  } catch {
    return null;
  }
}

export async function discoverGoogleResources(tenantId: string): Promise<GoogleResourceCatalog> {
  const connection = await getConnection(tenantId, "google");
  const scopes = connection?.scopes ?? [];
  const disconnected = !connection || connection.status !== "connected";
  const baseStatus = connection?.status === "needs_reauth" ? "needs_reauth" : connection?.status === "error" ? "error" : disconnected ? "disconnected" : "connected";
  const config = await getAnalyticsConfig(tenantId);
  const selectedGbp = await readSelectedGbp(tenantId);
  if (disconnected) {
    return {
      connection: { connected: false, status: baseStatus, scopes },
      gsc: { status: "unavailable", resources: [], selected: config.gscProperty },
      ga4: { status: "unavailable", resources: [], selected: config.ga4PropertyId },
      gbp: { status: "unavailable", resources: [], selected: selectedGbp },
    };
  }

  const token = await getToken(tenantId);
  const hasGscScope = scopes.includes(GSC_READ_SCOPE);
  const hasGa4Scope = scopes.includes(GA4_READ_SCOPE);
  const hasGbpScope = scopes.includes(GBP_WRITE_SCOPE);
  if (!token) {
    return {
      connection: { connected: true, status: baseStatus, scopes },
      gsc: { status: hasGscScope ? "unavailable" : "not_granted", resources: [], selected: config.gscProperty },
      ga4: { status: hasGa4Scope ? "unavailable" : "not_granted", resources: [], selected: config.ga4PropertyId },
      gbp: { status: hasGbpScope ? "unavailable" : "not_granted", resources: [], selected: selectedGbp },
    };
  }

  const [gsc, ga4, gbp] = await Promise.all([
    hasGscScope ? listSearchConsoleResources(token) : Promise.resolve(null),
    hasGa4Scope ? listGa4Resources(token) : Promise.resolve(null),
    hasGbpScope ? listGbpResources(token) : Promise.resolve(null),
  ]);

  return {
    connection: { connected: true, status: baseStatus, scopes },
    gsc: { status: gsc === null ? (hasGscScope ? "unavailable" : "not_granted") : "ready", resources: gsc ?? [], selected: config.gscProperty },
    ga4: { status: ga4 === null ? (hasGa4Scope ? "unavailable" : "not_granted") : "ready", resources: ga4 ?? [], selected: config.ga4PropertyId },
    gbp: { status: gbp === null ? (hasGbpScope ? "unavailable" : "not_granted") : "ready", resources: gbp ?? [], selected: selectedGbp },
  };
}

export async function selectGoogleResource(
  tenantId: string,
  kind: GoogleResourceKind,
  resourceId: string,
): Promise<GoogleResourceCatalog> {
  const normalized = resourceId.trim();
  if (!normalized || normalized.length > 512) throw new Error("resource_id_invalid");
  const catalog = await discoverGoogleResources(tenantId);
  const group = catalog[kind];
  const chosen = group.resources.find((item) => item.id === normalized);
  if (!chosen) throw new Error(group.status === "not_granted" ? "scope_not_granted" : group.status === "unavailable" ? "resources_unavailable" : "resource_not_available");

  if (kind === "gsc") {
    await setAnalyticsConfig(tenantId, { gscProperty: chosen.id });
  } else if (kind === "ga4") {
    const id = chosen.id.startsWith("properties/") ? chosen.id.slice("properties/".length) : chosen.id;
    await setAnalyticsConfig(tenantId, { ga4PropertyId: id });
  } else {
    const split = chosen.id.split("|");
    if (split.length !== 2 || !split[0] || !split[1]) throw new Error("resource_id_invalid");
    const redis = getRedis();
    if (!redis) throw new Error("persistence_unavailable");
    await redis.set(`google-meta:${tenantId}`, { accountId: split[0], locationId: split[1] }, { ex: 60 * 60 * 24 * 365 });
  }

  return discoverGoogleResources(tenantId);
}
