import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { calendarProviderSchema, type CalendarProvider } from "./contracts";
import { CalendarProviderError } from "./adapters";

type State = { workspaceId: string; userId: string; provider: CalendarProvider; exp: number; nonce: string };
type CalendarFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_TTL_SECONDS = Math.ceil(STATE_TTL_MS / 1000);

function secret(): string | null {
  return process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET || null;
}

function sign(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function encode(state: State, key: string): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function createCalendarOAuthState(input: { workspaceId: string; userId: string; provider: CalendarProvider }, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("OAuth state secret not configured");
  const state: State = { ...input, exp: now + STATE_TTL_MS, nonce: randomBytes(16).toString("base64url") };
  const token = encode(state, key);
  const redis = getRedis();
  if (redis) void redis.set(`workspace-calendar-oauth:${state.nonce}`, "1", { ex: STATE_TTL_SECONDS, nx: true }).catch(() => undefined);
  return token;
}

export async function consumeCalendarOAuthState(value: string, now = Date.now()): Promise<State | null> {
  const key = secret();
  if (!key) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = sign(body, key);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  let state: Partial<State>;
  try { state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<State>; } catch { return null; }
  if (!state.workspaceId || !state.userId || !state.nonce || !state.provider || typeof state.exp !== "number" || state.exp < now) return null;
  const provider = calendarProviderSchema.safeParse(state.provider);
  if (!provider.success) return null;
  const redis = getRedis();
  if (redis) {
    try {
      const deleted = await redis.del(`workspace-calendar-oauth:${state.nonce}`);
      if (deleted === 0) return null;
    } catch {
      // HMAC and expiry remain the integrity boundary when Redis is unavailable.
    }
  }
  return { workspaceId: state.workspaceId, userId: state.userId, provider: provider.data, exp: state.exp, nonce: state.nonce };
}

function redirectUri(provider: CalendarProvider, appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/workspace/calendar-connections/oauth/${provider}/callback`;
}

export function calendarOAuthConfiguration(provider: CalendarProvider, appUrl: string): { clientId: string; authorizationUrl: string; redirectUri: string; scopes: string[] } | null {
  const parsed = calendarProviderSchema.safeParse(provider);
  if (!parsed.success) return null;
  const callback = redirectUri(parsed.data, appUrl);
  if (parsed.data === "outlook") {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) return null;
    const scopes = ["openid", "profile", "offline_access", "Calendars.ReadWrite"];
    const query = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: callback, response_mode: "query", scope: scopes.join(" ") });
    return { clientId, authorizationUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`, redirectUri: callback, scopes };
  }
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const scopes = ["https://www.googleapis.com/auth/calendar"];
  const query = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: callback, access_type: "offline", prompt: "consent", scope: scopes.join(" ") });
  return { clientId, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, redirectUri: callback, scopes };
}

export type CalendarOAuthTokens = { accessToken: string; refreshToken?: string; expiresAt?: string | null; scopes: string[] };

function tokenExpiry(body: Record<string, unknown>): string | null {
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);
  return Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function tokenScopes(body: Record<string, unknown>): string[] {
  return typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [];
}

async function tokenResponse(provider: CalendarProvider, response: Response, message: string, unauthorizedMessage = "Calendar authorization has expired. Reconnect the calendar."): Promise<CalendarOAuthTokens> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) {
    const unauthorized = response.status === 400 || response.status === 401 || response.status === 403;
    throw new CalendarProviderError({
      provider,
      message: unauthorized ? unauthorizedMessage : message,
      status: response.status,
      code: unauthorized ? "unauthorized" : "timeout",
      retryable: !unauthorized && (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500),
    });
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token.trim() ? body.refresh_token : undefined,
    expiresAt: tokenExpiry(body),
    scopes: tokenScopes(body),
  };
}

export async function exchangeCalendarOAuthCode(provider: CalendarProvider, code: string, redirect: string, fetcher: CalendarFetch = fetch): Promise<CalendarOAuthTokens> {
  const parsed = calendarProviderSchema.parse(provider);
  const clientId = parsed === "outlook" ? process.env.MICROSOFT_CLIENT_ID : (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
  const clientSecret = parsed === "outlook" ? process.env.MICROSOFT_CLIENT_SECRET : process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new CalendarProviderError({ provider: parsed, message: "Calendar OAuth is not configured.", code: "provider" });
  const endpoint = parsed === "outlook" ? "https://login.microsoftonline.com/common/oauth2/v2.0/token" : "https://oauth2.googleapis.com/token";
  const response = await fetcher(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirect, grant_type: "authorization_code" }).toString() });
  return tokenResponse(parsed, response, "Calendar authorization could not be completed.", "Calendar authorization could not be completed.");
}

/**
 * Refresh an expired access token without repeating any calendar write.
 * Provider semantics verified against the primary docs on 2026-09-20:
 * Microsoft Entra refresh flow
 * (https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token)
 * and Google offline refresh
 * (https://developers.google.com/identity/protocols/oauth2/web-server#offline).
 */
export async function refreshCalendarOAuthToken(provider: CalendarProvider, refreshToken: string, fetcher: CalendarFetch = fetch): Promise<CalendarOAuthTokens> {
  const parsed = calendarProviderSchema.parse(provider);
  if (!refreshToken.trim()) {
    throw new CalendarProviderError({ provider: parsed, message: "Calendar authorization has expired. Reconnect the calendar.", code: "unauthorized" });
  }
  const clientId = parsed === "outlook" ? process.env.MICROSOFT_CLIENT_ID : (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
  const clientSecret = parsed === "outlook" ? process.env.MICROSOFT_CLIENT_SECRET : process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new CalendarProviderError({ provider: parsed, message: "Calendar authorization is not configured.", code: "provider" });
  const endpoint = parsed === "outlook" ? "https://login.microsoftonline.com/common/oauth2/v2.0/token" : "https://oauth2.googleapis.com/token";
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    });
  } catch {
    throw new CalendarProviderError({ provider: parsed, message: "Calendar token refresh could not be completed. Retry after checking the connection.", code: "timeout", retryable: true });
  }
  return tokenResponse(parsed, response, "Calendar token refresh could not be completed. Retry after checking the connection.");
}

export function calendarOAuthRedirectUri(provider: CalendarProvider, appUrl = process.env.APP_URL || "http://localhost:3000"): string {
  return redirectUri(calendarProviderSchema.parse(provider), appUrl);
}
