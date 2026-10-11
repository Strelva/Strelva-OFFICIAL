import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import type { PreviewDiff } from "@/lib/agent-risk";
import { StEmpty, StHead, StMono, StPage, StRow, StRows, StState } from "@/components/ui/strelva/Kit";
import { DraftActions } from "./DraftActions";

export interface DraftItem {
  tenantId: string;
  tenantName: string;
  section: string;
  data: Record<string, unknown>;
  diffs: PreviewDiff[];
}

/** The same presentation serves real reads and a provider-disabled preview. */
export function DraftsView({ drafts, readOnly = false }: { drafts: DraftItem[]; readOnly?: boolean }) {
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.drafts.label} meta="Review the exact content change before it goes live." />
    {drafts.length === 0 ? <StEmpty>No pending drafts. Proposed content changes will appear here for review.</StEmpty> :
      <StRows label="Pending drafts">{drafts.map(draft => <StRow key={`${draft.tenantId}-${draft.section}`} title={draft.tenantName} kind={draft.section} end={<StState kind="need">Needs review</StState>} align="start">
        {typeof draft.data._updatedAt === "string" ? <StMono as="time" dateTime={draft.data._updatedAt}>{new Date(draft.data._updatedAt).toLocaleString()}</StMono> : null}
        <DraftActions tenant={draft.tenantId} section={draft.section} readOnly={readOnly} preview={{ type: "content_update", metadata: { ...draft.data, diffs: draft.diffs } }} />
      </StRow>)}</StRows>}
  </StPage>;
}
