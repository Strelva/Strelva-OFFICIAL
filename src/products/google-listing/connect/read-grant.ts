import { randomUUID } from "node:crypto";
import { recordConnectionHolder } from "@/platform/connections/holders";
import { readProviderAccess } from "@/platform/connections/access";
import { assertGoogleConnectionEligible, googleConnectionEligibility } from "../connection-policy";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { bindingEncryptionReady, encryptForBinding } from "@/platform/account-bindings/store";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { revokeProviderAuthorization } from "@/platform/infra/provider-revocation";
import { refreshGoogleTokens, GA4_READ_SCOPE, GSC_READ_SCOPE } from "@/platform/infra/google-token";
import { queryGscTotals, type GscTotals } from "@/platform/infra/search-console";
import { queryGa4Report, type Ga4Report } from "@/platform/infra/analytics";
import { listGa4Resources, listSearchConsoleResources, type GoogleResource } from "@/platform/infra/google-resources";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { googleReadGrantEnabled } from "./flags";
import { isBusinessOwner } from "./service";
import { hashValue, newNonce, signPayload, verifyPayload } from "./signed";
import * as store from "./store";

/**
 * Search Console and Analytics on the workspace path, as a separate,
 * optional, read-only Google grant (scope decision, L4 2026-10-12):
 *
 *  - The listing grant stays business.manage only. Adding read scopes to it
 *    would widen what the owner agreed to for their listing, and change the
 *    pinned grant generation every approved Google plan depends on.
 *  - This grant asks for webmasters.readonly and analytics.readonly only, in
 *    its own consent, with no include_granted_scopes, so Google never folds it
 *    into the listing grant. It is stored in its own row
 *    (workspace_google_read_grants) and disconnects on its own.
 *  - The owner may connect a different Google account here (an agency or web
 *    person often owns Analytics).
 */

export const READ_GRANT_COOKIE = "strelva_google_read_grant";
export const READ_GRANT_CALLBACK_PATH = "/api/workspace/google/read-grant/callback";
export const READ_GRANT_SCOPES = [GSC_READ_SCOPE, GA4_READ_SCOPE] as const;
const IDENTITY = ["openid", "email", "https://www.googleapis.com/auth/userinfo.email"];
const stateSchema = z.object({ workspaceId: z.string().uuid(), ownerId: z.string().uuid(), nonceHash: z.string().regex(/^[a-f0-9]{64}$/), exp: z.number() }).strict();

export interface ReadGrantDeps { fetcher?: typeof fetch; enabled?: (actor: WorkspaceActor, workspaceId: string) => Promise<boolean>; owner?: (actor: WorkspaceActor, workspaceId: string) => Promise<boolean> }
export async function readGrantAvailable(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
  return googleReadGrantEnabled() && bindingEncryptionReady() && await publishingEnabledForWorkspace(workspaceId, actor) && (await googleConnectionEligibility(actor, workspaceId)).eligible;
}
async function admit(actor: WorkspaceActor, workspaceId: string, deps: ReadGrantDeps) {
  await assertGoogleConnectionEligible(actor, workspaceId);
  if (!(await (deps.enabled ?? readGrantAvailable)(actor, workspaceId))) throw new WorkspaceConflictError("Search Console and Analytics aren't open for this business yet.");
  if (!(await (deps.owner ?? isBusinessOwner)(actor, workspaceId))) throw new WorkspaceAccessError("Only the business owner connects Search Console and Analytics.");
}
function client(origin: string) {
  if (new URL(origin).origin !== process.env.NEXT_PUBLIC_APP_URL || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new WorkspaceConflictError("Google sign-in isn't set up here yet.");
  return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirect: `${origin}${READ_GRANT_CALLBACK_PATH}` };
}

export async function beginReadGrant(actor: WorkspaceActor, workspaceId: string, origin: string, deps: ReadGrantDeps = {}) {
  await admit(actor, z.string().uuid().parse(workspaceId), deps);
  const config = client(origin), nonce = newNonce();
  const state = signPayload("google-read-grant-state-v1", { workspaceId, ownerId: actor.userId, nonceHash: hashValue(nonce) }, 600_000);
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: "code", scope: ["openid", "email", ...READ_GRANT_SCOPES].join(" "), access_type: "offline", prompt: "consent", state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, nonce };
}

export type ReadGrantFinish = { status: "connected" | "refused"; workspaceId: string };
export async function finishReadGrant(actor: WorkspaceActor, state: string, nonce: string, code: string, origin: string, deps: ReadGrantDeps = {}): Promise<ReadGrantFinish> {
  const claims = verifyPayload("google-read-grant-state-v1", state, stateSchema);
  if (!claims || claims.ownerId !== actor.userId || !nonce || claims.nonceHash !== hashValue(nonce)) throw new WorkspaceAccessError("This Google sign-in has expired or belongs to another session. Start again.");
  await admit(actor, claims.workspaceId, deps);
  const refused = { status: "refused" as const, workspaceId: claims.workspaceId };
  if (!code || code.length > 4096) return refused;
  const fetcher: typeof fetch = async (...args) => { await assertGoogleConnectionEligible(actor, claims.workspaceId); return (deps.fetcher ?? fetch)(...args); };
  const config = client(origin);
  const exchanged = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirect, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10_000) });
  if (!exchanged.ok) return refused;
  const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), scope: z.string(), expires_in: z.number().positive().max(86400) }).safeParse(await exchanged.json().catch(() => null));
  if (!tokens.success) return refused;
  const granted = tokens.data.scope.split(/\s+/).filter(Boolean);
  // Google's granular consent lets the owner untick one; keep what was granted. Anything beyond read is refused, never stored.
  if (granted.some(scope => !IDENTITY.includes(scope) && !(READ_GRANT_SCOPES as readonly string[]).includes(scope)) || !granted.some(scope => (READ_GRANT_SCOPES as readonly string[]).includes(scope))) return refused;
  const who = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.data.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const identity = who.ok ? z.object({ sub: z.string().min(1).max(255), email: z.string().email(), email_verified: z.literal(true) }).passthrough().safeParse(await who.json().catch(() => null)) : null;
  if (!identity?.success) return refused;
  await store.googleReadGrant(actor, claims.workspaceId, "save", {
    subject: identity.data.sub, googleEmail: identity.data.email.toLowerCase(), scopes: granted,
    refreshTokenCiphertext: encryptForBinding(tokens.data.refresh_token), accessTokenCiphertext: encryptForBinding(tokens.data.access_token),
    tokenExpiresAt: new Date(Date.now() + tokens.data.expires_in * 1000).toISOString(),
  });
  await recordConnectionHolder({ref:`google_business_profile:read-grant:${claims.workspaceId}`,provider:"google_business_profile",workspaceId:claims.workspaceId,accountHolder:{kind:"business",workspaceId:claims.workspaceId},accessThrough:readProviderAccess("google_business_profile").through,actor,commandId:randomUUID()});
  return { status: "connected", workspaceId: claims.workspaceId };
}

/** A current access token for this business's read grant, refreshed when needed. Null when not connected or Google refuses. */
async function readToken(actor: WorkspaceActor, workspaceId: string): Promise<{ grant: store.ReadGrant; token: string } | null> {
  await assertGoogleConnectionEligible(actor, workspaceId);
  const grant = await store.googleReadGrant(actor, workspaceId, "secrets");
  if (!grant || grant.status !== "connected" || !grant.refreshTokenCiphertext) return null;
  const fresh = grant.accessTokenCiphertext && grant.tokenExpiresAt && Date.parse(grant.tokenExpiresAt) > Date.now() + 60_000;
  if (fresh) return { grant, token: decryptSecret(grant.accessTokenCiphertext!) };
  await assertGoogleConnectionEligible(actor, workspaceId);
  const refreshed = await refreshGoogleTokens(decryptSecret(grant.refreshTokenCiphertext));
  if (!refreshed.ok) return null;
  await store.googleReadGrant(actor, workspaceId, "token", { accessTokenCiphertext: encryptForBinding(refreshed.tokens.accessToken), tokenExpiresAt: new Date(Date.now() + (refreshed.tokens.expiresIn ?? 3600) * 1000).toISOString() });
  return { grant, token: refreshed.tokens.accessToken };
}

export interface ReadGrantView {
  connected: boolean;
  googleEmail: string | null;
  gsc: { granted: boolean; property: string | null };
  ga4: { granted: boolean; property: string | null };
}
export async function readGrantView(actor: WorkspaceActor, workspaceId: string): Promise<ReadGrantView> {
  await assertGoogleConnectionEligible(actor, workspaceId);
  const grant = await store.googleReadGrant(actor, workspaceId, "read");
  const connected = grant?.status === "connected";
  return { connected, googleEmail: connected ? grant!.googleEmail : null,
    gsc: { granted: connected && grant!.scopes.includes(GSC_READ_SCOPE), property: connected ? grant!.gscProperty : null },
    ga4: { granted: connected && grant!.scopes.includes(GA4_READ_SCOPE), property: connected ? grant!.ga4Property : null } };
}

/** Properties the connected account can read, for the owner to choose from. */
export async function readGrantProperties(actor: WorkspaceActor, workspaceId: string): Promise<{ gsc: GoogleResource[] | null; ga4: GoogleResource[] | null }> {
  if (!(await isBusinessOwner(actor, workspaceId))) throw new WorkspaceAccessError();
  const current = await readToken(actor, workspaceId);
  if (!current) return { gsc: null, ga4: null };
  const [gsc, ga4] = await Promise.all([
    current.grant.scopes.includes(GSC_READ_SCOPE) ? listSearchConsoleResources(current.token) : Promise.resolve(null),
    current.grant.scopes.includes(GA4_READ_SCOPE) ? listGa4Resources(current.token) : Promise.resolve(null),
  ]);
  return { gsc, ga4 };
}

/** The owner picks which Search Console site and Analytics property this business reads. Only ones the account can see. */
export async function chooseReadGrantProperties(actor: WorkspaceActor, workspaceId: string, input: { gscProperty?: string; ga4Property?: string }) {
  const available = await readGrantProperties(actor, workspaceId);
  const patch: Record<string, string> = {};
  if (input.gscProperty !== undefined) { if (!available.gsc?.some(item => item.id === input.gscProperty)) throw new WorkspaceConflictError("That Search Console site isn't on the connected account."); patch.gscProperty = input.gscProperty; }
  if (input.ga4Property !== undefined) { if (!available.ga4?.some(item => item.id === input.ga4Property)) throw new WorkspaceConflictError("That Analytics property isn't on the connected account."); patch.ga4Property = input.ga4Property; }
  await store.googleReadGrant(actor, workspaceId, "select", patch);
}

export interface ReadGrantSummary {
  gsc: { status: "ok"; totals: GscTotals } | { status: "unconfigured" | "unavailable" };
  ga4: { status: "ok"; report: Ga4Report } | { status: "unconfigured" | "unavailable" };
}
/** Last 28 days, read only, for any member of the business. Never throws for a Google failure. */
export async function readGrantSummary(actor: WorkspaceActor, workspaceId: string, days = 28): Promise<ReadGrantSummary | null> {
  const view = await readGrantView(actor, workspaceId);
  if (!view.connected) return null;
  const end = new Date(), start = new Date(end.getTime() - days * 86_400_000);
  const range = [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)] as const;
  const current = await readToken(actor, workspaceId).catch(() => null);
  const gsc: ReadGrantSummary["gsc"] = !view.gsc.property ? { status: "unconfigured" } : !current ? { status: "unavailable" }
    : await queryGscTotals(view.gsc.property, current.token, ...range).then(totals => totals ? { status: "ok" as const, totals } : { status: "unavailable" as const }).catch(() => ({ status: "unavailable" as const }));
  const ga4: ReadGrantSummary["ga4"] = !view.ga4.property ? { status: "unconfigured" } : !current ? { status: "unavailable" }
    : await queryGa4Report(view.ga4.property, current.token, ...range).then(report => report ? { status: "ok" as const, report } : { status: "unavailable" as const }).catch(() => ({ status: "unavailable" as const }));
  return { gsc, ga4 };
}

/** Ends the read grant: stored tokens are cleared first, then revoked at Google. The listing grant is untouched. */
export async function disconnectReadGrant(actor: WorkspaceActor, workspaceId: string): Promise<"revoked" | "revoked_locally"> {
  if (!(await isBusinessOwner(actor, workspaceId))) throw new WorkspaceAccessError();
  const token = await store.revokeGoogleReadGrant(actor, workspaceId);
  if (!token) return "revoked_locally";
  const outcome = await revokeProviderAuthorization("google", decryptSecret(token)).catch(() => null);
  return outcome && ["revoked", "already_revoked"].includes(outcome.outcome) ? "revoked" : "revoked_locally";
}
