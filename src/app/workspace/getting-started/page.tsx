import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { GettingStarted } from "@/experience/getting-started/GettingStarted";
import { businessSignupReleaseEnabled, gettingStartedHref } from "@/platform/business-signup-release";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { readPlace } from "@/platform/owner-entry/place-state";
import { gettingStarted } from "@/products/getting-started/server";
import { connectedSitesReleasedFor } from "@/products/connected-sites/server";
import { publishingEnabledForWorkspace } from "@/products/publishing/release";

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
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(gettingStartedHref(workspaceId))}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  const state = await readPlace("getting-started", workspaceId, async () => {
    const [business, google, connect] = await Promise.all([
      gettingStarted.read(actor, workspaceId),
      publishingEnabledForWorkspace(workspaceId, actor).catch(() => false),
      connectedSitesReleasedFor(actor, workspaceId).catch(() => false),
    ]);
    return { business, google, connect };
  });
  const home = `/workspace?${new URLSearchParams({ workspaceId })}`;
  return <StrelvaShell title="Getting started" workspaceId={workspaceId} accountName={user.email}>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {state.kind === "ready" ? <GettingStarted business={state.data.business} links={{
        home,
        details: `/workspace/business-details?${new URLSearchParams({ workspaceId })}`,
        agency: `/workspace?${new URLSearchParams({ workspaceId, view: "help" })}`,
        google: state.data.google ? `/workspace/google?${new URLSearchParams({ workspaceId })}` : null,
        connect: state.data.connect ? `/workspace/site?${new URLSearchParams({ workspaceId, entry: "connect" })}` : null,
        request: requestId ? `/workspace/delivery/${requestId}` : null,
      }} />
        : <div className="mx-auto w-full max-w-2xl px-4 py-12 md:px-8">
          <h1 className="font-display text-[24px] font-medium">{state.kind === "permission" ? "This business isn't available to your account." : "Getting started couldn't open just now."}</h1>
          <p className="mt-3 text-[15px] leading-6 text-gray-muted">{state.kind === "permission" ? "Sign in with the account that owns it, or ask its owner to invite you." : "Nothing changed. Try again in a moment."}</p>
          <Link className="mt-4 inline-block underline underline-offset-4" href="/workspace">Go to your workspace</Link>
        </div>}
    </div>
  </StrelvaShell>;
}
