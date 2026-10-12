const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const GA4_ACCOUNTS_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

const MAX_RESOURCES = 100;
const MAX_LABEL = 240;

export interface GoogleResource {
  id: string;
  label: string;
  detail?: string;
}

export type JsonRecord = Record<string, unknown>;

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_LABEL) : fallback;
}

export function resource(id: unknown, label: unknown, detail?: unknown): GoogleResource | null {
  const normalizedId = text(id);
  if (!normalizedId || normalizedId.length > 512) return null;
  const normalizedLabel = text(label, normalizedId);
  return {
    id: normalizedId,
    label: normalizedLabel || normalizedId,
    ...(text(detail) ? { detail: text(detail) } : {}),
  };
}

export function uniqueResources(items: Array<GoogleResource | null>): GoogleResource[] {
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

export async function googleJson(url: string, token: string): Promise<JsonRecord | null> {
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

export async function listSearchConsoleResources(token: string): Promise<GoogleResource[] | null> {
  const body = await googleJson(GSC_SITES_URL, token);
  if (!body) return null;
  const entries = Array.isArray(body.siteEntry) ? body.siteEntry : [];
  return uniqueResources(entries.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as JsonRecord;
    return resource(row.siteUrl, row.siteUrl, row.permissionLevel);
  }));
}

export async function listGa4Resources(token: string): Promise<GoogleResource[] | null> {
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

