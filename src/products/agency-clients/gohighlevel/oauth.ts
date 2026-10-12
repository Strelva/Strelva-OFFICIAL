import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRedis } from "@/platform/infra/redis";
import { GHL_AUTHORIZE_URL, GHL_SCOPES, GHL_TOKEN_URL, ghlClientCredentials } from "./config";
import { GHL_MESSAGES, GhlApiError, type GhlFetch } from "./client";

/**
 * Agency-level OAuth for HighLevel, on the calendar OAuth pattern
 * (src/products/scheduling/calendar/oauth.ts): an HMAC-signed, expiring,
 * single-use state that names the Strelva agency workspace and the person.
 *
 * HighLevel's docs say Marketplace uses `state` to verify callbacks but their
 * sample callback carries only `code`, so whether `state` is echoed back is
 * UNVERIFIED. The connect route therefore also sets the same state in an
 * HttpOnly cookie; the callback accepts either, and both are checked the same
 * way (signature, expiry, person, single use). An install started from the
 * HighLevel Marketplace, not from Strelva, has neither and is refused.
 */

type State = { workspaceId: string; userId: string; exp: number; nonce: string };

const STATE_TTL_MS = 10 * 60 * 1000;
const NONCE_PREFIX = "agency-ghl-oauth:";
export const GHL_STATE_COOKIE = "strelva_ghl_oauth_state";
export const GHL_STATE_COOKIE_MAX_AGE_SECONDS = Math.ceil(STATE_TTL_MS / 1000);

function stateSecret(): string | null {
  return process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET || null;
}

function sign(value: string, key: string): string {
  return createHmac("sha256", `ghl-import\0${key}`).update(value).digest("base64url");
}

export function createGhlOAuthState(input: { workspaceId: string; userId: string }, now = Date.now()): string {
  const key = stateSecret();
  if (!key) throw new GhlApiError(GHL_MESSAGES.not_configured, "not_configured");
  const state: State = { ...input, exp: now + STATE_TTL_MS, nonce: randomBytes(16).toString("base64url") };
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const redis = getRedis();
  if (redis) void redis.set(`${NONCE_PREFIX}${state.nonce}`, "1", { ex: GHL_STATE_COOKIE_MAX_AGE_SECONDS, nx: true }).catch(() => undefined);
  return `${body}.${sign(body, key)}`;
}

export async function consumeGhlOAuthState(value: string, now = Date.now()): Promise<State | null> {
  const key = stateSecret();
  if (!key) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const actual = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(body, key));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let state: Partial<State>;
  try { state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<State>; } catch { return null; }
  if (!state.workspaceId || !state.userId || !state.nonce || typeof state.exp !== "number" || state.exp < now) return null;
  const redis = getRedis();
  if (redis) {
    try {
      if (await redis.del(`${NONCE_PREFIX}${state.nonce}`) === 0) return null;
    } catch {
      // HMAC and expiry remain the integrity boundary when Redis is unavailable.
    }
  }
  return { workspaceId: state.workspaceId, userId: state.userId, exp: state.exp, nonce: state.nonce };
}

/** The consent page an agency admin opens. They choose the agency (bulk install), not one sub-account. */
export function ghlAuthorizationUrl(redirectUri: string, state: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const credentials = ghlClientCredentials(env);
  if (!credentials) return null;
  const query = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    client_id: credentials.clientId,
    scope: GHL_SCOPES.join(" "),
    state,
    // Keep login in the same tab so the cookie fallback survives (docs/oauth/Authorization.md).
    loginWindowOpenMode: "self",
  });
  return `${GHL_AUTHORIZE_URL}?${query}`;
}

/**
 * POST /oauth/token response (apps/oauth.json GetAccessCodeSuccessfulResponseDto).
 * `userType` "Company" is the agency token from a bulk install; a "Location"
 * token means the person picked one sub-account and cannot list the others.
 */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().optional(),
  scope: z.string().optional(),
  userType: z.string().optional(),
  companyId: z.string().optional(),
  locationId: z.string().optional(),
  userId: z.string().optional(),
  isBulkInstallation: z.boolean().optional(),
  approveAllLocations: z.boolean().optional(),
  installToFutureLocations: z.boolean().optional(),
}).passthrough();

export interface GhlAgencyTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  companyId: string;
  installedBy: string | null;
  approveAllLocations: boolean | null;
  installToFutureLocations: boolean | null;
}

export class GhlConnectError extends Error {
  constructor(message: string, readonly code: "not_company" | "token_refused" | "not_configured" | "unavailable") {
    super(message);
    this.name = "GhlConnectError";
  }
}

async function tokenCall(body: Record<string, string>, fetcher: GhlFetch, now: number): Promise<GhlAgencyTokens> {
  const credentials = ghlClientCredentials();
  if (!credentials) throw new GhlConnectError(GHL_MESSAGES.not_configured, "not_configured");
  let response: Response;
  try {
    response = await fetcher(GHL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, ...body }).toString(),
    });
  } catch {
    throw new GhlConnectError(GHL_MESSAGES.unavailable, "unavailable");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new GhlConnectError(GHL_MESSAGES.unavailable, "unavailable");
    throw new GhlConnectError(GHL_MESSAGES.revoked, "token_refused");
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new GhlConnectError(GHL_MESSAGES.malformed, "unavailable");
  const token = parsed.data;
  if (token.userType !== "Company" || !token.companyId) {
    throw new GhlConnectError("Connect HighLevel from your agency view and choose your agency, not a single sub-account, so Strelva can list every client.", "not_company");
  }
  const expiresIn = token.expires_in && Number.isFinite(token.expires_in) && token.expires_in > 0 ? token.expires_in : null;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null,
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : [],
    companyId: token.companyId,
    installedBy: token.userId ?? null,
    approveAllLocations: token.approveAllLocations ?? null,
    installToFutureLocations: token.installToFutureLocations ?? null,
  };
}

/** Exchange the consent code for the agency (Company) token. */
export function exchangeGhlCode(code: string, redirectUri: string, fetcher: GhlFetch = fetch, now = Date.now()): Promise<GhlAgencyTokens> {
  return tokenCall({ grant_type: "authorization_code", code, user_type: "Company", redirect_uri: redirectUri }, fetcher, now);
}

/**
 * Refresh the agency token. HighLevel rotates the refresh token on every use
 * (docs/oauth/Authorization.md FAQ: a used refresh token is replaced, the new
 * one is valid for a year), so the caller must store the returned one.
 */
export function refreshGhlToken(refreshToken: string, fetcher: GhlFetch = fetch, now = Date.now()): Promise<GhlAgencyTokens> {
  if (!refreshToken.trim()) return Promise.reject(new GhlConnectError(GHL_MESSAGES.revoked, "token_refused"));
  return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken, user_type: "Company" }, fetcher, now);
}
