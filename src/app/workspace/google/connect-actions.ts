"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { beginNativeGoogleOAuth, NATIVE_GOOGLE_OAUTH_COOKIE } from "@/products/google-listing/server";
import { admitOwnerConnect, beginGoogleDiscovery, beginReadGrant, chooseReadGrantProperties, chosenTarget, decideFoundFact, disconnectReadGrant, GOOGLE_DISCOVER_CHOICES_COOKIE, GOOGLE_DISCOVER_COOKIE, GOOGLE_RETURN_COOKIE, importGoogleFoundFacts, safeReturnTo, READ_GRANT_COOKIE, readDiscoveryChoices } from "@/products/google-listing/server";

/** Owner Connect Google and found-fact decisions. Every Google call here is a read or a consent redirect. */
async function owner(form: FormData) {
  const workspaceId = z.string().uuid().parse(form.get("workspaceId"));
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/google?workspaceId=${workspaceId}`)}`);
  return { workspaceId, actor: { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } };
}
const page = (workspaceId: string, params: Record<string, string>) => `/workspace/google?${new URLSearchParams({ workspaceId, ...params })}`;
const appOrigin = () => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").origin; } catch { return ""; } };

export async function startGoogleConnect(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let url: string;
  try {
    const started = await beginGoogleDiscovery(actor, workspaceId, appOrigin(), { admit: admitOwnerConnect });
    const store = await cookies();
    store.set(GOOGLE_DISCOVER_COOKIE, started.nonce, { httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"), path: "/api/workspace/publishing/google/discover", maxAge: 600 });
    // A step that sent the owner here (the claim review) gets them back after the grant.
    const returnTo = safeReturnTo(form.get("returnTo"));
    if (returnTo) store.set(GOOGLE_RETURN_COOKIE, returnTo, { httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"), path: "/", maxAge: 1800 });
    else store.delete(GOOGLE_RETURN_COOKIE);
    url = started.url;
  } catch { redirect(page(workspaceId, { connect: "unavailable" })); }
  redirect(url);
}

export async function chooseGoogleListing(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  const store = await cookies();
  let url: string;
  try {
    const choices = readDiscoveryChoices(actor, workspaceId, store.get(GOOGLE_DISCOVER_CHOICES_COOKIE)?.value);
    if (!choices) throw new Error("expired");
    await admitOwnerConnect(actor, workspaceId);
    const target = chosenTarget(choices, String(form.get("accountId") ?? ""), String(form.get("locationId") ?? ""));
    const started = await beginNativeGoogleOAuth(actor, target, appOrigin());
    store.set(NATIVE_GOOGLE_OAUTH_COOKIE, started.nonce, { httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"), path: "/api/workspace/publishing/google/oauth", maxAge: 600 });
    store.delete({ name: GOOGLE_DISCOVER_CHOICES_COOKIE, path: "/workspace/google" });
    url = started.url;
  } catch { redirect(page(workspaceId, { connect: "expired" })); }
  redirect(url);
}

export async function rereadGoogleFoundFacts(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let status = "unavailable";
  try { status = (await importGoogleFoundFacts(actor, workspaceId)).status; } catch { /* reported below */ }
  redirect(page(workspaceId, { read: status }));
}

export async function decideGoogleFoundFact(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let outcome = "failed";
  try {
    outcome = await decideFoundFact(actor, workspaceId, { factId: String(form.get("factId")), decision: form.get("decision") === "dismiss" ? "dismiss" : "confirm", commandId: String(form.get("commandId")) });
  } catch { /* reported below */ }
  redirect(page(workspaceId, { fact: outcome }));
}

export async function startSearchReadGrant(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let url: string;
  try {
    const started = await beginReadGrant(actor, workspaceId, appOrigin());
    (await cookies()).set(READ_GRANT_COOKIE, started.nonce, { httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"), path: "/api/workspace/google/read-grant", maxAge: 600 });
    url = started.url;
  } catch { redirect(page(workspaceId, { search: "unavailable" })); }
  redirect(url);
}

export async function chooseSearchProperty(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let result = "chosen";
  try {
    const gsc = form.get("gscProperty"), ga4 = form.get("ga4Property");
    await chooseReadGrantProperties(actor, workspaceId, { ...(typeof gsc === "string" && gsc ? { gscProperty: gsc } : {}), ...(typeof ga4 === "string" && ga4 ? { ga4Property: ga4 } : {}) });
  } catch { result = "failed"; }
  redirect(page(workspaceId, { search: result }));
}

export async function disconnectSearchReadGrant(form: FormData): Promise<void> {
  const { workspaceId, actor } = await owner(form);
  let result = "failed";
  try { result = await disconnectReadGrant(actor, workspaceId); } catch { /* reported below */ }
  redirect(page(workspaceId, { search: result }));
}
