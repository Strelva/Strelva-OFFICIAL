import { listGa4Resources, listSearchConsoleResources, text, resource, uniqueResources, googleJson, type GoogleResource, type JsonRecord } from "@/platform/infra/google-resources";
export { listGa4Resources, listSearchConsoleResources } from "@/platform/infra/google-resources";
import { GA4_READ_SCOPE, GSC_READ_SCOPE, getGoogleAccessToken } from "./google-token";
import { getAnalyticsConfig, setAnalyticsConfig } from "./analytics";
import { GBP_WRITE_SCOPE } from "./gbp-replies";
import {
  beginGoogleTenantOperation,
  getGoogleGrant,
  getGoogleLocation,
  googleLocationIdFromName,
  recordAuthorizedGoogleLocationSelection,
  type GoogleGrant,
  type GoogleOperationActor,
} from "./google-access";

const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

export type GoogleResourceKind = "gsc" | "ga4" | "gbp";

export type { GoogleResource } from "@/platform/infra/google-resources";
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

async function getToken(tenantId: string, grant: GoogleGrant | null): Promise<string | null> {
  if (!grant || grant.status !== "connected") return null;
  return getGoogleAccessToken(tenantId);
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
      const locationId = googleLocationIdFromName(text(locationRow.name));
      if (!locationId) continue;
      const label = text(locationRow.title, `${accountRow.accountName ?? "Google Business"} location`);
      resources.push(resource(`${accountId}|${locationId}`, label, accountId));
    }
  }
  return uniqueResources(resources);
}

async function readSelectedGbp(tenantId: string, grant: GoogleGrant | null): Promise<{ accountId: string; locationId: string } | null> {
  try {
    return await getGoogleLocation(tenantId, grant);
  } catch {
    return null;
  }
}

export async function discoverGoogleResources(tenantId: string): Promise<GoogleResourceCatalog> {
  const grant = await getGoogleGrant(tenantId);
  const scopes = grant?.scopes ?? [];
  const disconnected = !grant || grant.status !== "connected";
  const baseStatus = grant?.status === "needs_reauth" ? "needs_reauth" : grant?.status === "error" ? "error" : disconnected ? "disconnected" : "connected";
  const config = await getAnalyticsConfig(tenantId);
  const selectedGbp = await readSelectedGbp(tenantId, grant);
  if (disconnected) {
    return {
      connection: { connected: false, status: baseStatus, scopes },
      gsc: { status: "unavailable", resources: [], selected: config.gscProperty },
      ga4: { status: "unavailable", resources: [], selected: config.ga4PropertyId },
      gbp: { status: "unavailable", resources: [], selected: selectedGbp },
    };
  }

  const token = await getToken(tenantId, grant);
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
  actor?: GoogleOperationActor,
): Promise<GoogleResourceCatalog> {
  const normalized = resourceId.trim();
  if (!normalized || normalized.length > 512) throw new Error("resource_id_invalid");
  if (kind === "gbp" && !actor) throw new Error("google_settings_permission_denied");
  const operation = kind === "gbp" ? await beginGoogleTenantOperation(tenantId, actor!) : undefined;
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
    await recordAuthorizedGoogleLocationSelection(tenantId, { accountId: split[0], locationId: split[1], title: chosen.label }, actor!, operation!);
  }

  return discoverGoogleResources(tenantId);
}
