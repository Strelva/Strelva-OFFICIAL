import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { classifyGoogleFailure } from "../client";
import { hashValue, newNonce, signPayload, verifyPayload } from "./signed";

/**
 * Connect Google, step one: find your listing. The owner signs in with the
 * Google account that runs their Business Profile and Strelva lists the
 * listings that account manages, so the owner can choose one. The access
 * token from this sign-in is used for those reads only and is never stored;
 * no refresh token is requested. Step two is the existing native grant
 * (native/oauth.ts), pinned to the chosen account, listing and Google email.
 *
 * The token is not revoked at Google: revoking would also end any grant this
 * Google account already gave Strelva. It expires on its own within the hour.
 */

export const GOOGLE_DISCOVER_COOKIE = "strelva_google_discover";
export const GOOGLE_DISCOVER_CHOICES_COOKIE = "strelva_google_discover_choices";
export const DISCOVER_CALLBACK_PATH = "/api/workspace/publishing/google/discover/callback";
const MANAGE = "https://www.googleapis.com/auth/business.manage";
const TEN_MINUTES = 600_000;
/** The signed list travels in one cookie (about 4 KB), so it holds at most this many listings. */
export const MAX_CHOICES = 8;

const stateSchema = z.object({ workspaceId: z.string().uuid(), ownerId: z.string().uuid(), nonceHash: z.string().regex(/^[a-f0-9]{64}$/), exp: z.number() }).strict();
export const discoveredListingSchema = z.object({
  accountId: z.string().regex(/^accounts\/[A-Za-z0-9_-]{1,64}$/), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  title: z.string().max(80), address: z.string().max(80).optional(),
}).strict();
export type DiscoveredListing = z.infer<typeof discoveredListingSchema>;
const choicesSchema = z.object({ workspaceId: z.string().uuid(), ownerId: z.string().uuid(), googleEmail: z.string().email(), listings: z.array(discoveredListingSchema).max(MAX_CHOICES), more: z.boolean(), exp: z.number() }).strict();
export type DiscoveryChoices = z.infer<typeof choicesSchema>;

export interface DiscoverDeps {
  /** Owner, release and configuration checks. Throws when this business can't connect Google here. */
  admit(actor: WorkspaceActor, workspaceId: string): Promise<void>;
  fetcher?: typeof fetch;
}

function oauthClient(origin: string) {
  if (new URL(origin).origin !== process.env.NEXT_PUBLIC_APP_URL || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new WorkspaceConflictError("Google sign-in isn't set up here yet.");
  return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirect: `${origin}${DISCOVER_CALLBACK_PATH}` };
}

export async function beginGoogleDiscovery(actor: WorkspaceActor, workspaceId: string, origin: string, deps: DiscoverDeps): Promise<{ url: string; nonce: string }> {
  await deps.admit(actor, z.string().uuid().parse(workspaceId));
  const client = oauthClient(origin), nonce = newNonce();
  const state = signPayload("google-discover-state-v1", { workspaceId, ownerId: actor.userId, nonceHash: hashValue(nonce) }, TEN_MINUTES);
  const params = new URLSearchParams({ client_id: client.clientId, redirect_uri: client.redirect, response_type: "code", scope: `openid email ${MANAGE}`, access_type: "online", prompt: "select_account", state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, nonce };
}

export type DiscoveryResult =
  | { status: "chosen"; choices: DiscoveryChoices; cookie: string }
  /** Google's Business Profile API access isn't approved for Strelva yet (quota 0 or API off). */
  | { status: "access_pending"; workspaceId: string }
  | { status: "no_listings"; workspaceId: string; googleEmail: string }
  | { status: "refused"; workspaceId: string };

type Json = Record<string, unknown>;
async function getJson(fetcher: typeof fetch, url: string, token: string): Promise<{ ok: true; body: Json } | { ok: false; pending: boolean }> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return { ok: false, pending: classifyGoogleFailure(response.status, await response.text().catch(() => "")) === "setup_pending" };
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? { ok: true, body: body as Json } : { ok: false, pending: false };
}
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

/** Reads the listings the signed-in account manages. Bounded: 5 accounts, MAX_CHOICES listings shown. */
export async function finishGoogleDiscovery(actor: WorkspaceActor, state: string, nonce: string, code: string, origin: string, deps: DiscoverDeps): Promise<DiscoveryResult> {
  const claims = verifyPayload("google-discover-state-v1", state, stateSchema);
  if (!claims || claims.ownerId !== actor.userId || !nonce || claims.nonceHash !== hashValue(nonce)) throw new WorkspaceAccessError("This Google sign-in has expired or belongs to another session. Start again.");
  await deps.admit(actor, claims.workspaceId);
  if (!code || code.length > 4096) return { status: "refused", workspaceId: claims.workspaceId };
  const fetcher = deps.fetcher ?? fetch, client = oauthClient(origin);
  const exchanged = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: client.redirect, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10_000) });
  if (!exchanged.ok) return { status: "refused", workspaceId: claims.workspaceId };
  const tokens = z.object({ access_token: z.string().min(1), scope: z.string() }).passthrough().safeParse(await exchanged.json().catch(() => null));
  if (!tokens.success || !tokens.data.scope.split(/\s+/).includes(MANAGE)) return { status: "refused", workspaceId: claims.workspaceId };
  const token = tokens.data.access_token;
  const who = await getJson(fetcher, "https://openidconnect.googleapis.com/v1/userinfo", token);
  const identity = who.ok ? z.object({ email: z.string().email(), email_verified: z.literal(true) }).passthrough().safeParse(who.body) : null;
  if (!identity?.success) return { status: "refused", workspaceId: claims.workspaceId };
  const googleEmail = identity.data.email.toLowerCase();
  const accounts = await getJson(fetcher, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", token);
  if (!accounts.ok) return accounts.pending ? { status: "access_pending", workspaceId: claims.workspaceId } : { status: "refused", workspaceId: claims.workspaceId };
  const listings: DiscoveredListing[] = [];
  let more = false;
  for (const account of (Array.isArray(accounts.body.accounts) ? accounts.body.accounts : []).slice(0, 5)) {
    const accountId = text((account as Json)?.name, 80);
    if (!/^accounts\/[A-Za-z0-9_-]{1,64}$/.test(accountId)) continue;
    const places = await getJson(fetcher, `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?${new URLSearchParams({ readMask: "name,title,storefrontAddress", pageSize: "100" })}`, token);
    if (!places.ok) { if (places.pending) return { status: "access_pending", workspaceId: claims.workspaceId }; continue; }
    for (const place of Array.isArray(places.body.locations) ? places.body.locations : []) {
      const row = place as Json, locationId = text(row.name, 120).replace(/^locations\//, "");
      const address = row.storefrontAddress as Json | undefined;
      const line = [...(Array.isArray(address?.addressLines) ? address.addressLines : []), address?.locality].map(value => text(value, 120)).filter(Boolean).join(", ");
      const parsed = discoveredListingSchema.safeParse({ accountId, locationId, title: text(row.title, 80) || "Google listing", ...(line ? { address: line.slice(0, 80) } : {}) });
      if (parsed.success) { if (listings.length < MAX_CHOICES) listings.push(parsed.data); else more = true; }
    }
  }
  if (!listings.length) return { status: "no_listings", workspaceId: claims.workspaceId, googleEmail };
  const choices = { workspaceId: claims.workspaceId, ownerId: actor.userId, googleEmail, listings, more };
  return { status: "chosen", choices: { ...choices, exp: Date.now() + TEN_MINUTES }, cookie: signPayload("google-discover-choices-v1", choices, TEN_MINUTES) };
}

/** The listings this owner just found, only for this business and this session. */
export function readDiscoveryChoices(actor: WorkspaceActor, workspaceId: string, cookie: string | undefined): DiscoveryChoices | null {
  const choices = cookie ? verifyPayload("google-discover-choices-v1", cookie, choicesSchema) : null;
  return choices && choices.ownerId === actor.userId && choices.workspaceId === workspaceId ? choices : null;
}

/** The exact native grant target for a listing the owner chose from the signed list. */
export function chosenTarget(choices: DiscoveryChoices, accountId: string, locationId: string) {
  const listing = choices.listings.find(item => item.accountId === accountId && item.locationId === locationId);
  if (!listing) throw new WorkspaceConflictError("Choose one of the listings Google showed. Start again if it isn't there.");
  return { workspaceId: choices.workspaceId, googlePrincipalEmail: choices.googleEmail, accountId: listing.accountId, locationId: listing.locationId };
}
