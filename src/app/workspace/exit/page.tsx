import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { redirect } from "next/navigation";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  if (typeof workspaceId !== "string") redirect("/workspace");
  return <StrelvaShell workspaceId={workspaceId} title="Business details" active="settings" detailsPlace="export" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><WorkspaceExit workspaceId={workspaceId} businessBillingReleased={process.env.STRELVA_BUSINESS_BILLING === "1"} /></StrelvaShell>;
}
