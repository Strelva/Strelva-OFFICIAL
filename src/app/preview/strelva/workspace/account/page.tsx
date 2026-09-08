import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account · Local interface preview",
  robots: { index: false, follow: false },
};

export default async function AccountPreviewPage({ searchParams }: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const emailConfirmed = state !== "unconfirmed";
  const workspacesUnavailable = state === "unavailable";
  return <WorkspaceAccountView
    appBase="/preview/strelva"
    signOut={null}
    managedHref="/preview/strelva/website"
    notice={<div className="border-b border-gray-border px-6 py-3 text-[14px] leading-5 text-gray-muted">Local interface preview · Fictional identity and access</div>}
    name="Morgan Reed"
    email="morgan@example.test"
    emailConfirmed={emailConfirmed}
    releaseOpen={state !== "closed"}
    workspacesUnavailable={workspacesUnavailable}
    workspaces={emailConfirmed && !workspacesUnavailable && state !== "empty" && state !== "closed" ? [
      { id: "preview-personal", kind: "personal", name: "My work", access: "member" },
      { id: "preview-agency", kind: "agency", name: "Northline Studio", access: "member" },
      { id: "preview-customer", kind: "customer", name: "Harbor Dental", access: "delegated_read" },
    ] : []}
  />;
}
