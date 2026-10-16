import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { XaButtonLink, XaEntry, XaHeadline, XaSays } from "@/components/ui/strelva/Xa";
import { entryAccountName } from "@/experience/getting-started/entry-account";
import { GettingStarted } from "@/experience/getting-started/GettingStarted";
import { businessSignupReleaseEnabled, gettingStartedHref } from "@/platform/business-signup-release";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { readPlace } from "@/platform/owner-entry/place-state";
import { gettingStarted } from "@/products/getting-started/server";
import { connectedSitesReleasedFor } from "@/products/connected-sites/server";
import { getWork } from "@/platform/workspaces/repository";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { createSupabaseAskHistory } from "@/platform/ask/history";
import { askReleaseMayBeOn } from "@/platform/ask/release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Getting started", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** The first-run view of one business (owner door). Off: the workspace, as before. */
export default async function GettingStartedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!businessSignupReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const requestId = typeof params.request === "string" && UUID.test(params.request) ? params.request : null;
  const checkWorkId = typeof params.check === "string" && UUID.test(params.check) ? params.check : null;
  const askId = typeof params.ask === "string" && UUID.test(params.ask) ? params.ask : null;
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(gettingStartedHref(workspaceId, requestId, checkWorkId, askId))}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  const state = await readPlace("getting-started", workspaceId, async () => {
    const [business, google, connect, check, ask] = await Promise.all([
      gettingStarted.read(actor, workspaceId),
      publishingEnabledForWorkspace(workspaceId, actor).catch(() => false),
      connectedSitesReleasedFor(actor, workspaceId).catch(() => false),
      checkWorkId ? getWork(actor, checkWorkId).catch(() => null) : null,
      // The owner's first ask from B2, read back from where it was saved; nothing shows if it can't be read.
      askId ? createSupabaseAskHistory().read(actor, { workspaceId, conversationId: askId, limit: 5 }).catch(() => null) : null,
    ]);
    const firstAsk = ask?.mine ? [...ask.messages].sort((a, b) => a.seq - b.seq).find(message => message.role === "user")?.content.trim() || null : null;
    return { business, google, connect, firstAsk, check: check?.workspaceId === workspaceId && ["website_audit", "ai_visibility"].includes(check.productId) ? check.id : null };
  });
  const home = `/workspace?${new URLSearchParams({ workspaceId })}`;
  const account = entryAccountName(user);
  // XA · B3–B5 live in the entry frame: the business is new and its workspace comes after this.
  if (state.kind !== "ready") return <XaEntry account={account} stage={{ pose: "alone", label: "Pebble beside your business, which is as you left it", title: "Nothing changed.", body: "Your business and its details are as you left them.", phone: "Nothing changed. Your business is as you left it." }}>
    <XaHeadline>{state.kind === "permission" ? "This business isn't available to your account." : "Getting started couldn't open just now."}</XaHeadline>
    <div role="alert"><XaSays>{state.kind === "permission" ? "Sign in with the account that owns it, or ask its owner to invite you." : "Nothing changed. Try again in a moment."}</XaSays></div>
    <XaButtonLink href={state.kind === "permission" ? "/workspace" : gettingStartedHref(workspaceId, requestId, checkWorkId, askId)} variant="primary" size="lg" block>{state.kind === "permission" ? "Go to your workspace" : "Try again"}</XaButtonLink>
  </XaEntry>;
  return <GettingStarted account={account} business={state.data.business} links={{
    home,
    details: `/workspace/business-details?${new URLSearchParams({ workspaceId })}`,
    agency: `/workspace?${new URLSearchParams({ workspaceId, view: "help" })}`,
    // L4 owns the fresh Connect Google start there and brings the owner back here.
    google: state.data.google ? `/workspace/google?${new URLSearchParams({ workspaceId, returnTo: gettingStartedHref(workspaceId) })}` : null,
    connect: state.data.connect ? `/workspace/site?${new URLSearchParams({ workspaceId, entry: "connect" })}` : null,
    check: state.data.check ? `/workspace?${new URLSearchParams({ workspaceId, view: "work", work: state.data.check })}` : null,
    request: requestId ? `/workspace/delivery/${requestId}` : null,
    // Ask keeps the conversation when it is on; otherwise the same words wait in Home's composer.
    ask: state.data.firstAsk ? { text: state.data.firstAsk, href: `/workspace?${new URLSearchParams({ workspaceId, view: askReleaseMayBeOn() ? "ask" : "home" })}` } : null,
  }} />;
}
