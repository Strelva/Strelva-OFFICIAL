import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/**
 * GoHighLevel (HighLevel) as an Import clients source. An agency connects its
 * HighLevel agency account once; Strelva reads the agency's sub-accounts and
 * offers each one as a row in the same Import clients preview a sheet uses.
 * Reading never adds a client. Every add goes through the agency's preview.
 *
 * API facts below were checked on 2026-10-12 against HighLevel's own
 * documentation: the OpenAPI specs at
 * https://github.com/GoHighLevel/highlevel-api-docs (apps/oauth.json,
 * apps/locations.json, apps/users.json, docs/oauth/Scopes.md,
 * docs/oauth/Authorization.md) and the versioned pages at
 * https://marketplace.gohighlevel.com/docs/2021-07-28/. No call was made
 * against HighLevel with real credentials. Items marked UNVERIFIED still need a
 * sandbox install (docs/operations/gohighlevel-import-2026-10-12.md).
 */

/** Off unless STRELVA_GHL_IMPORT_RELEASE=1, on top of the workspace release. */
export function ghlImportReleaseEnabled(
  environment: { STRELVA_GHL_IMPORT_RELEASE?: string } = { STRELVA_GHL_IMPORT_RELEASE: process.env.STRELVA_GHL_IMPORT_RELEASE },
): boolean {
  return workspaceReleaseEnabled() && environment.STRELVA_GHL_IMPORT_RELEASE === "1";
}

/** Placeholder env names. No value exists anywhere yet; Jacob creates the Marketplace app first. */
export const GHL_ENV = {
  clientId: "HIGHLEVEL_CLIENT_ID",
  clientSecret: "HIGHLEVEL_CLIENT_SECRET",
} as const;

export function ghlClientCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } | null {
  const clientId = env[GHL_ENV.clientId]?.trim();
  const clientSecret = env[GHL_ENV.clientSecret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const GHL_API_BASE = "https://services.leadconnectorhq.com";
/** Standard (non-whitelabel) consent page. Docs: docs/oauth/Authorization.md. */
export const GHL_AUTHORIZE_URL = "https://marketplace.gohighlevel.com/v2/oauth/chooselocation";
export const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;
/**
 * Every endpoint used here is documented under Version 2021-07-28 in the
 * OpenAPI specs and on marketplace.gohighlevel.com/docs/2021-07-28. HighLevel
 * also publishes a "v3" doc set with renamed paths (/oauth/location-token,
 * /oauth/installed-locations). We stay on 2021-07-28 because both doc sets
 * list it; moving to v3 is a later, separate change.
 */
export const GHL_API_VERSION = "2021-07-28";

/**
 * Agency-level read scopes (docs/oauth/Scopes.md, checked 2026-10-12):
 * - locations.readonly: GET /locations/search (Agency or Sub-Account token)
 * - users.readonly: GET /users/search (Agency or Sub-Account token)
 * - oauth.readonly: GET /oauth/installedLocations (Agency token)
 * None is in HighLevel's list of agency-only scopes that block sub-account
 * installs (AppDistribution page). No write scope is requested.
 */
export const GHL_SCOPES = ["locations.readonly", "users.readonly", "oauth.readonly"] as const;

/**
 * Burst limit per Marketplace app per resource (Company or Location): 100
 * requests per 10 seconds; daily 200,000. Source: docs/oauth/Authorization.md
 * ("What are current rate limits for API 2.0?"). We pace below it.
 */
export const GHL_BURST_LIMIT = 100;
export const GHL_BURST_WINDOW_MS = 10_000;

export function ghlRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/workspace/agency-clients/gohighlevel/oauth/callback`;
}

export function ghlWebhookPath(): string {
  return "/api/webhooks/gohighlevel";
}
