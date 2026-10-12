import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readWorkspaceRecaps } from "@/products/recaps/server";
import { WorkspaceRecaps, type RecapPeriodFilter, type WorkspaceRecapsState } from "@/experience/recaps/WorkspaceRecaps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recaps", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** The workspace home of /dashboard/reports (owner-entry spec §5). */
export default async function RecapsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const period: RecapPeriodFilter = params.period === "week" || params.period === "month" ? params.period : "all";
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) {
    redirect(`/sign-in?next=${encodeURIComponent(`/workspace/recaps?workspaceId=${workspaceId}`)}`);
  }
  let state: WorkspaceRecapsState;
  try {
    state = { kind: "ready", sites: await readWorkspaceRecaps({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId) };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) state = { kind: "permission" };
    else {
      console.error("[recaps] page read failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
      state = { kind: "error" };
    }
  }
  return <WorkspaceRecaps workspaceId={workspaceId} state={state} period={period} />;
}
