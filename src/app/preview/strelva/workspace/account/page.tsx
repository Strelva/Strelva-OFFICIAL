import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PublicContinuationCard } from "@/experience/workspace/PublicContinuationCard";

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
    continuation={state === "continuation" ? <PublicContinuationCard actorEmail="morgan@example.test" brief={{
      version: 1,
      id: "44444444-4444-4444-8444-444444444444",
      businessName: "Harbor Dental",
      request: "We keep forgetting to follow up with people who request quotes.",
      result: "Every inquiry has a visible next step.",
      resultTitle: "Give every inquiry a next step.",
      scope: "One inquiry source, a first response, and one follow-up.",
      review: true,
      fileNames: ["current-process.txt"],
    }} destinations={[
      { id: "11111111-1111-4111-8111-111111111111", kind: "personal", name: "Alex’s work" },
      { id: "22222222-2222-4222-8222-222222222222", kind: "agency", name: "North Studio" },
    ]} /> : undefined}
    workspaces={emailConfirmed && !workspacesUnavailable && state !== "empty" && state !== "closed" ? [
      { id: "11111111-1111-4111-8111-111111111111", kind: "personal", name: "Alex’s work", access: "member" },
      { id: "22222222-2222-4222-8222-222222222222", kind: "agency", name: "North Studio", access: "member" },
      { id: "33333333-3333-4333-8333-333333333333", kind: "customer", name: "Harbor Dental", access: "delegated_read" },
    ] : []}
  />;
}
