import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; caseId?: string }> }) {
  if (!workspaceReleaseEnabled()) return <main data-dashboard className="min-h-dvh bg-surface-base px-6 py-24 text-warm-black"><div className="mx-auto max-w-xl"><p className="text-sm text-gray-fg">Strelva</p><h1 className="mt-6 font-display text-3xl">Workspaces are not open yet.</h1><p className="mt-4 text-gray-fg">Private onboarding will be available after the workspace release checks are complete.</p></div></main>;
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
