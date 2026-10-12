import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerInvitationPreview } from "./OwnerInvitationPreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner invitations · Local interface preview", robots: { index: false, follow: false } };

/** Fictional business, with a synthetic transport; every action stays inside this preview. */
export default async function OwnerInvitationsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; delivery?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, delivery } = await searchParams;
  return <OwnerInvitationPreview state={state} delivery={delivery} />;
}
