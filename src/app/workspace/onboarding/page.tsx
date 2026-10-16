import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { XaNotOpenYet } from "@/experience/states/XaStates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Getting started", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; caseId?: string }> }) {
  if (!workspaceReleaseEnabled()) return <XaNotOpenYet place="getting-started" />;
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) {
    const target = new URLSearchParams();
    if (params.workspaceId) target.set("workspaceId", params.workspaceId);
    if (params.caseId) target.set("caseId", params.caseId);
    const query = target.toString();
    redirect(`/sign-in?next=${encodeURIComponent(`/workspace/onboarding${query ? `?${query}` : ""}`)}`);
  }
  const target = new URLSearchParams({ view: "onboarding" });
  if (params.workspaceId) target.set("workspaceId", params.workspaceId);
  if (params.caseId) target.set("work", params.caseId);
  redirect(`/workspace?${target.toString()}`);
}
