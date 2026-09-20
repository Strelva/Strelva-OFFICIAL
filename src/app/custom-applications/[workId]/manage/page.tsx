import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWork } from "@/platform/workspaces";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage custom application", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CustomApplicationManagePage({ params }: { params: Promise<{ workId: string }> }) {
  const workId = (await params).workId;
  if (!z.string().uuid().safeParse(workId).success) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/custom-applications/${workId}/manage`)}`);
  const work = await getWork(actor, workId);
  if (!work || work.productId !== "custom-applications" || work.resourceKind !== "custom-application") notFound();
  redirect(`/workspace?workspaceId=${encodeURIComponent(work.workspaceId)}&view=custom-applications&work=${encodeURIComponent(workId)}`);
}
