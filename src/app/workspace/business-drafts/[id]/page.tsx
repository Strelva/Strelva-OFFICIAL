import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { WorkspacePlace } from "@/experience/places/WorkspacePlace";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { PostgresBusinessFactDraftStore } from "@/platform/ask/workspace-drafts-repository";
import { readBusinessRecord } from "@/platform/business-record/service";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { systemsReleasedFor } from "@/platform/systems-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review business change", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Read-only review. Approve is always on the distinct Needs you confirmation. */
export default async function BusinessDraftPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!askReleaseMayBeOn() || !needsYouReleaseEnabled()) redirect("/workspace");
  const { id } = await params;
  const { workspaceId, actor } = await openWorkspacePlace(await searchParams, `/workspace/business-drafts/${id}`);
  if (!await systemsReleasedFor(actor, workspaceId)) redirect(`/workspace?workspaceId=${workspaceId}`);
  const state = await readPlace("business-draft", workspaceId, async () => {
    const [drafts, record] = await Promise.all([PostgresBusinessFactDraftStore.list(actor, workspaceId), readBusinessRecord(actor, workspaceId)]);
    return { draft: drafts.find(row => row.id === id && row.workspaceId === workspaceId) ?? null, record };
  });
  const data = state.kind === "ready" ? state.data : null;
  const draft = data?.draft;
  return <WorkspacePlace workspaceId={workspaceId} eyebrow="Needs you" title={draft?.summary ?? "Review business change"}
    intro="This is the exact proposed change. Nothing is approved from Ask Strelva."
    state={state} errorTitle="This change couldn't load" errorBody="Nothing changed. Reload to read the saved draft.">
    {data && !draft ? <Card padding="lg" className="mt-8"><p>This draft is unavailable or belongs to another business.</p></Card> : null}
    {draft && data ? <div className="mt-8 grid gap-6">
      <Card padding="lg">
        <h2 className="text-lg font-medium">Proposed change</h2>
        <p className="mt-2 text-sm text-gray-muted">State: {draft.status}. Based on business record revision {draft.expectedRevision}.</p>
        {draft.expectedRevision !== data.record.revision && draft.status === "pending" ? <p role="alert" className="mt-4 text-sm">Your business record changed after this draft. It must be refreshed before approval.</p> : null}
        <pre className="mt-4 whitespace-pre-wrap break-all text-sm leading-6">{JSON.stringify(draft.patch, null, 2)}</pre>
      </Card>
      <Card padding="lg">
        <h2 className="text-lg font-medium">Current business record</h2>
        <pre className="mt-4 whitespace-pre-wrap break-all text-sm leading-6">{JSON.stringify({ revision: data.record.revision, facts: data.record.facts, services: data.record.services, people: data.record.people }, null, 2)}</pre>
      </Card>
      <p className="text-sm leading-6 text-gray-muted">Approving saves the exact proposed change to your business record. Website and Google publishing stay separate decisions.</p>
      <Link className="min-h-11 py-3 text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2" href={`/workspace?workspaceId=${workspaceId}`}>Open the decision in Needs you</Link>
    </div> : null}
  </WorkspacePlace>;
}
