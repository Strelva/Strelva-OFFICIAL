import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { ConnectedSiteChanges } from "@/experience/connected-sites/ConnectedSiteChanges";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { connectedSiteChangesStore, keepYourSiteMayBeOn, keepYourSiteReleasedFor } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** A Request about a connected site opens its task (plan, make the edit, check). Everything else opens the delivery panel. */
async function connectedSiteTarget(requestId: string): Promise<{ workspaceId: string; systemId: string } | null> {
  if (!keepYourSiteMayBeOn()) return null;
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) return null;
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  const target = await connectedSiteChangesStore().forRequest(actor, requestId).catch(() => null);
  return target && await keepYourSiteReleasedFor(actor, target.workspaceId).catch(() => false) ? target : null;
}

export default async function DeliveryPage({ params }: { params: Promise<{ requestId: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const parsed = z.string().uuid().safeParse((await params).requestId);
  if (!parsed.success) notFound();
  const target = await connectedSiteTarget(parsed.data);
  if (target) return <StrelvaShell title="Request" workspaceId={target.workspaceId}><ConnectedSiteChanges workspaceId={target.workspaceId} systemId={target.systemId} focusRequestId={parsed.data} /></StrelvaShell>;
  return <StrelvaShell title="Request"><DeliveryCommitmentPanel key={parsed.data} requestId={parsed.data} /></StrelvaShell>;
}
