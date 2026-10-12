import { StCopy, StEmpty, StMono, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";

/** Support inspection only; digest decisions belong to the business workspace. */
export function MaintenanceDigests({ initialDigests }: { initialDigests: MaintenanceDigest[]; request?: typeof fetch }) {
  if (initialDigests.length === 0) return <StEmpty><StState kind="live">No pending digests</StState><StCopy muted>Maintenance digests are prepared weekly on Mondays. Any proposed upkeep appears here for inspection.</StCopy></StEmpty>;
  return <div className="space-y-6">
    <StCopy muted>The business owner reviews proposed upkeep. Platform support cannot approve or dismiss it.</StCopy>
    {initialDigests.map(digest => <StSection key={digest.tenant} title={<StTextButton href={`/admin/clients/${encodeURIComponent(digest.tenant)}`}>{digest.siteName || digest.tenant}</StTextButton>} meta={<StMono>{digest.items.length} items · week of {digest.weekOf}</StMono>} action={<StTextButton href="/workspace">Open business workspace</StTextButton>}>
      <StRows label={`Proposed upkeep for ${digest.siteName || digest.tenant}`}>{digest.items.map(item => <StRow key={item.id} kind={item.type === "health" ? "Site health" : "Content"} title={item.title} detail={item.detail} />)}</StRows>
    </StSection>)}
  </div>;
}
