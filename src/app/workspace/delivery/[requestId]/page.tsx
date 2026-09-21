import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function DeliveryPage({ params }: { params: Promise<{ requestId: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const parsed = z.string().uuid().safeParse((await params).requestId);
  if (!parsed.success) notFound();
  return <StrelvaShell title="Delivery"><div className="mx-auto w-full max-w-3xl p-6"><DeliveryCommitmentPanel key={parsed.data} requestId={parsed.data} /></div></StrelvaShell>;
}
