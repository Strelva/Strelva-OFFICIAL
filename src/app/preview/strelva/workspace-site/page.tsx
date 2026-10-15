import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WorkspaceSitePreview } from "@/experience/websites/WorkspaceSitePreview";
import { isSiteTab } from "@/platform/workspaces/site-places";
import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Website preview", robots: { index: false, follow: false } };

/** Fixture-only: the workspace website frame, editor and "Ask for a change". `kind`, `tab`, `role`, `state` pick what to review; `agent=1` shows the page with a coding agent connected. */
export default async function WorkspaceSitePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const kind = params.kind === "request" ? "request" : "native";
  const role = params.role === "member" || params.role === "admin" || params.role === "operator" ? params.role : "owner";
  const state = params.state === "empty" || params.state === "error" || params.state === "permission" || params.state === "not_found" ? params.state : "ready";
  const mode = params.mode === "dark" ? "dark" : "light";
  return <SystemsCanonShell businessName={kind === "native" ? "Great Lakes Dried Fruit" : "McClear's Pub"} systemName="Website" mode={mode} pins={[
    { id: "website", kind: "website", title: kind === "native" ? "greatlakesdriedfruit.com" : "mclearsbuffalo.com", current: true, href: "/preview/strelva/workspace-site" },
  ]}><WorkspaceSitePreview kind={kind} tab={isSiteTab(params.tab) ? params.tab : null} role={role} state={state} mode={mode} codeAgent={params.agent === "1"} /></SystemsCanonShell>;
}
