import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PublishingContentPreview } from "@/experience/workspace/preview/PublishingContentPreview";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";
import { BusinessFactMappingsPreview } from "@/experience/workspace/preview/BusinessFactMappingsPreview";
import { PublishingRecordPreview } from "@/experience/workspace/preview/PublishingRecordPreview";

export const dynamic = "force-dynamic";
export default async function PublishingPreviewPage({ searchParams }: { searchParams: Promise<{ kind?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { kind, state = "ready" } = await searchParams;
  if (kind === "mappings") return <BusinessFactMappingsPreview state={state} />;
  if (kind === "record") return <PublishingRecordPreview state={state} />;
  const action = async () => { "use server"; };
  if (kind === "google") return <WorkspaceGoogle workspaceId="5e000000-0000-4000-8000-000000000010" action={action} reviewId="fictional-review" replyText="Thanks for visiting, Dana."
    state={state === "error" ? { kind: "error" } : { kind: "ready", data: state === "empty" ? [] : [{ tenantId: "juniper", locationId: "fictional-location", name: "Juniper Bakery on Google", control: { workspaceId: "5e000000-0000-4000-8000-000000000010", locationId: "fictional-location", paused: state === "paused", accessPending: state === "pending", updatedAt: null }, canManage: state !== "read_only", connected: state !== "disconnected", drafts: [{ id: "fictional-draft", title: "Review your Google holiday hours", body: "Closed Friday after Thanksgiving." }], receipts: [] }] }} />;
  return <main className="mx-auto max-w-3xl"><PublishingContentPreview kind={kind === "newsletter" ? "newsletter" : "website"} state={state} /></main>;
}
