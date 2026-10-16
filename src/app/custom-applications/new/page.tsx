import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { CustomApplicationCreateExperience } from "@/experience/custom-applications/CustomApplicationCreateExperience";
import { CustomToolRequest } from "@/experience/custom-applications/CustomToolRequest";
import { getSupabase } from "@/platform/infra/db/client";
import { readBusinessProviderIdentity } from "@/platform/service-requests/provider-options";
import { readVersionActor } from "@/platform/system-versions/supabase-store";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New internal tool", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Who builds here: a person in through an agency seat on this business, or a
 * member of an agency workspace making its own tool. Everyone else (owners,
 * staff) is asked to describe the tool to their agency instead. Unreadable
 * means not a builder: the build file is never shown on a guess.
 */
async function viewerBuilds(workspaceId: string, actor: { userId: string; verifiedEmail: string }): Promise<{ builds: boolean; name: string | null }> {
  try {
    const scope = await readVersionActor(actor);
    const membership = scope.memberships.find(row => row.businessId === workspaceId);
    const db = getSupabase();
    const { data } = db ? await db.from("workspaces").select("kind, name").eq("id", workspaceId).maybeSingle() : { data: null };
    const name = data && typeof data.name === "string" ? data.name : null;
    if (membership?.via === "provider_seat") return { builds: true, name };
    return { builds: Boolean(membership && data?.kind === "agency"), name };
  } catch { return { builds: false, name: null }; }
}

export default async function CustomApplicationCreatePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  const value = (await searchParams).workspaceId;
  const workspaceId = typeof value === "string" && z.string().uuid().safeParse(value).success ? value : null;
  if (!workspaceId) redirect("/workspace");
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/custom-applications/new?workspaceId=${workspaceId}`)}`);
  const { builds, name } = await viewerBuilds(workspaceId, actor);
  const businessName = name ?? "your business";
  if (builds) return <StrelvaShell title="New internal tool" workspaceId={workspaceId} systemsReleased><CustomApplicationCreateExperience workspaceId={workspaceId} businessName={businessName} /></StrelvaShell>;
  const provider = await readBusinessProviderIdentity(actor, workspaceId).catch(() => null);
  return <StrelvaShell title="New internal tool" workspaceId={workspaceId} systemsReleased>
    <CustomToolRequest workspaceId={workspaceId} businessName={businessName} agency={provider ? { id: provider.agencyWorkspaceId, name: provider.name } : null}
      requestsHref={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=requests`} />
  </StrelvaShell>;
}
