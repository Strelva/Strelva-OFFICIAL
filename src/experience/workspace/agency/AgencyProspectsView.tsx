import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StEmpty, StHead, StMono, StNotice, StPage, StPillLink, StSkeleton, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";

/** Presentation only. The route and native reader retain membership authority. */
export function AgencyProspectsView({ workspaceId, prospects, error, signedIn = true, addClientEnabled = false, loading = false }: {
  workspaceId?: string; prospects: readonly AgencyProspect[]; error?: string | null; signedIn?: boolean; addClientEnabled?: boolean; loading?: boolean;
}) {
  const workspaceHref = workspaceId ? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` : "/workspace";
  return <StrelvaShell title="Prospects" signedIn={signedIn} workspaceId={workspaceId} signOut={null}>
    <StPage width="wide">
      <StHead crumb={{ label: "Workspace", href: workspaceHref }} title="Prospects" meta="The latest 200 requests from your agency’s check links." />
      {loading ? <div role="status" className="space-y-4"><p>Reading prospects…</p><StSkeleton /><StSkeleton width="70%" /></div> : error ? <StNotice tone="critical">{error}</StNotice> : prospects.length === 0 ? <StEmpty>No prospects yet. Share your agency check link to start receiving requests.</StEmpty> : <StTable label="Agency prospect requests" columns={[{ key: "business", label: "Business" }, { key: "contact", label: "Contact" }, { key: "check", label: "Check" }, { key: "received", label: "Received" }]} rows={prospects.map(prospect => ({ key: prospect.id, cells: {
        business: <><span>{prospect.business}</span>{prospect.url ? <small className="block text-xs font-normal text-gray-muted break-words">{prospect.url}</small> : null}</>,
        contact: <>{prospect.name}<small className="block text-xs text-gray-muted break-words">{prospect.email}</small></>,
        check: <>{prospect.source === "monitor" ? "Answer check" : "Website check"} · <StMono>{prospect.grade} ({prospect.score}/100)</StMono></>,
        received: <><StMono as="time" dateTime={prospect.created_at}>{new Date(prospect.created_at).toLocaleDateString("en-US")}</StMono>{addClientEnabled && workspaceId ? <div><StPillLink variant="soft" href={`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId, prospect: prospect.id })}`}>Add as client</StPillLink></div> : null}</>,
      } }))} />}
      <StTextButton href={workspaceHref}>Back to workspace</StTextButton>
    </StPage>
  </StrelvaShell>;
}
