import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { encryptForBinding, googleBindingsEnabled, bindingEncryptionReady } from "@/platform/account-bindings/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { nativeGoogleLifecycle } from "./server";
export const NATIVE_GOOGLE_OAUTH_COOKIE = "strelva_native_google_oauth";
export const nativeGoogleOAuthTargetSchema = z.object({ workspaceId: z.string().uuid(), googlePrincipalEmail: z.string().email().max(254).transform(value => value.toLowerCase()), accountId: z.string().regex(/^accounts\/[A-Za-z0-9_-]{1,64}$/), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const claimsSchema = nativeGoogleOAuthTargetSchema.extend({ id: z.string().uuid(), ownerId: z.string().uuid(), nonceHash: z.string().regex(/^[a-f0-9]{64}$/), exp: z.number().int() }).strict();
export const nativeGoogleOAuthHash = (value: string) => createHash("sha256").update(value).digest("hex");
function secret() { const value = process.env.OAUTH_STATE_SECRET; if (!value) throw new Error("Native Google OAuth signing is unavailable."); return value; }
export function signNativeGoogleOAuth(claims: z.infer<typeof claimsSchema>) { const data = Buffer.from(JSON.stringify(claimsSchema.parse(claims))).toString("base64url"); return `${data}.${createHmac("sha256", secret()).update(`native-google-oauth-v1:${data}`).digest("base64url")}`; }
export function verifyNativeGoogleOAuth(state: string, nonce: string, actor: WorkspaceActor, now = Date.now()) {
  try {
    if (state.length > 2048 || nonce.length > 128) throw new Error();
    const [data, signature, extra] = state.split("."); if (!data || !signature || extra) throw new Error();
    const expected = Buffer.from(createHmac("sha256", secret()).update(`native-google-oauth-v1:${data}`).digest("base64url")), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(data, "base64url").toString()));
    if (claims.ownerId !== actor.userId || claims.exp <= now || claims.exp > now + 600_000 || claims.nonceHash !== nativeGoogleOAuthHash(nonce)) throw new Error();
    return claims;
  } catch { throw new Error("Native Google OAuth state or current owner could not be confirmed."); }
}
function configuration(origin: string) {
  if (!googleBindingsEnabled() || !bindingEncryptionReady()) throw new Error("Native Google encrypted grants are not enabled.");
  if (new URL(origin).origin !== process.env.NEXT_PUBLIC_APP_URL || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("Native Google OAuth origin/project is not configured.");
  return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirect: `${origin}/api/workspace/publishing/google/oauth/callback` };
}
export async function beginNativeGoogleOAuth(actor: WorkspaceActor, raw: unknown, origin: string) {
  const target = nativeGoogleOAuthTargetSchema.parse(raw), config = configuration(origin);
  if (!(await publishingEnabledForWorkspace(target.workspaceId, actor))) throw new Error("Native Google publishing is not enabled.");
  const nonce = randomBytes(32).toString("base64url"), id = randomUUID();
  const claims = { ...target, id, ownerId: actor.userId, nonceHash: nativeGoogleOAuthHash(nonce), exp: Date.now() + 600_000 };
  const state = signNativeGoogleOAuth(claims);
  await nativeGoogleLifecycle(actor, target.workspaceId, "begin_oauth", { id, accountId: target.accountId, locationId: target.locationId, nonceHash: claims.nonceHash, stateHash: nativeGoogleOAuthHash(state) });
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: "code", scope: "openid email https://www.googleapis.com/auth/business.manage", access_type: "offline", prompt: "consent", login_hint: target.googlePrincipalEmail, state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, nonce };
}
/** Provider reads validate the named place before any credentials are committed.
 * A consumed exchange is never replayed after unknown token exchange failure. */
export async function finishNativeGoogleOAuth(actor: WorkspaceActor, state: string, nonce: string, code: string, origin: string, fetcher: typeof fetch = fetch) {
  const claims = verifyNativeGoogleOAuth(state, nonce, actor), config = configuration(origin);
  if (!(await publishingEnabledForWorkspace(claims.workspaceId, actor))) throw new Error("Native Google publishing is not enabled.");
  if (!code || code.length > 4096) throw new Error("Native Google OAuth code unavailable.");
  await nativeGoogleLifecycle(actor, claims.workspaceId, "consume_oauth", { id: claims.id, nonceHash: claims.nonceHash, stateHash: nativeGoogleOAuthHash(state) });
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirect, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) { await nativeGoogleLifecycle(actor, claims.workspaceId, "fail_oauth", { id: claims.id }); throw new Error("Native Google OAuth exchange was refused. A fresh signed attempt is required."); }
  const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), scope: z.string(), expires_in: z.number().positive().max(86400) }).parse(await response.json());
  const scopes = tokens.scope.split(/\s+/); if (!scopes.includes("https://www.googleapis.com/auth/business.manage") || !scopes.includes("openid")) throw new Error("Google account identity and business management consent required.");
  const userResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) });
  if (!userResponse.ok) throw new Error("Google account identity unavailable.");
  const identity = z.object({ sub: z.string().min(1).max(255), email: z.string().email(), email_verified: z.literal(true) }).parse(await userResponse.json());
  if (identity.email.toLowerCase() !== claims.googlePrincipalEmail) { await nativeGoogleLifecycle(actor, claims.workspaceId, "fail_oauth", { id: claims.id }); throw new Error("Google consent did not match the named account principal."); }
  let pageToken: string | undefined, found = false;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ readMask: "name", pageSize: "100", ...(pageToken ? { pageToken } : {}) });
    const places = await fetcher(`https://mybusinessbusinessinformation.googleapis.com/v1/${claims.accountId}/locations?${params}`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) });
    if (!places.ok) throw new Error("The authorized Google account/place rights could not be confirmed.");
    const data = z.object({ locations: z.array(z.object({ name: z.string() })).max(100).default([]), nextPageToken: z.string().max(4096).optional() }).parse(await places.json());
    found = data.locations.some(place => place.name === `locations/${claims.locationId}`); if (found) break;
    pageToken = data.nextPageToken; if (!pageToken) break;
  }
  if (!found) { await nativeGoogleLifecycle(actor, claims.workspaceId, "fail_oauth", { id: claims.id }); throw new Error("Google did not authorize the exact selected account/place."); }
  const stored=await nativeGoogleLifecycle(actor, claims.workspaceId, "finish_oauth", { id: claims.id, subject: identity.sub, scopes, accessTokenCiphertext: encryptForBinding(tokens.access_token), refreshTokenCiphertext: encryptForBinding(tokens.refresh_token), tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString() });
  return {...z.object({bindingId:z.string().uuid(),workspaceId:z.string().uuid(),accountId:z.string(),locationId:z.string(),status:z.literal("connected")}).parse(stored),googlePrincipalEmail:identity.email.toLowerCase(),subjectDigest:nativeGoogleOAuthHash(identity.sub)};
}
