import { StCopy, StEmpty, StMono, StNotice, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import type { draftPortfolioOpportunity } from "./actions";
import type { PortfolioOpportunitiesSnapshot } from "./portfolio-opportunities";

function incompleteReadMessage(snapshot: PortfolioOpportunitiesSnapshot): string {
  if (snapshot.incomplete.some((read) => read.source === "client_directory")) {
    return "The client directory could not be read, so this opportunity scan is unavailable.";
  }

  const names = snapshot.incomplete
    .map((read) => read.siteName || read.tenantId)
    .filter((name): name is string => Boolean(name));
  const sourceLabels = Array.from(
    new Set(
      snapshot.incomplete.map((read) =>
        read.source === "site_health"
          ? "site health"
          : read.source === "reviews"
            ? "reviews"
            : "retention signals",
      ),
    ),
  );
  if (names.length > 0) {
    const shown = names.slice(0, 3).join(", ");
    const remainder = names.length - Math.min(names.length, 3);
    return remainder > 0
      ? `${sourceLabels.join(" and ")} could not be checked for ${shown} and ${remainder} more client${remainder === 1 ? "" : "s"}.`
      : `${sourceLabels.join(" and ")} could not be checked for ${shown}.`;
  }
  return `${sourceLabels.join(" and ")} could not be checked.`;
}

/** Read-only support signals. Agency authorship requires ordinary agency access. */
export function PortfolioOpportunitiesClient({ snapshot }: { snapshot: PortfolioOpportunitiesSnapshot; draftOpportunity?: typeof draftPortfolioOpportunity }) {
  const readsIncomplete = snapshot.incomplete.length > 0;
  if (snapshot.totalOpportunities === 0 && !readsIncomplete) return null;
  return <StSection title="Support observations" meta={<StMono>{snapshot.totalOpportunities}</StMono>}>
    <StCopy muted>Inspect these signals here. Prepare client work in the business workspace with ordinary agency or owner access.</StCopy>
    {readsIncomplete && <StNotice tone="need" action={<StTextButton href="/admin/actions">Retry reads</StTextButton>}><strong>This opportunity scan is incomplete.</strong> {incompleteReadMessage(snapshot)}</StNotice>}
    {snapshot.totalOpportunities === 0 ? <StEmpty>No verified opportunities to display yet. Retry before treating the portfolio as clear.</StEmpty> : snapshot.groups.map(group => <StSection key={group.kind} title={group.title} meta={<StMono>{group.clients.length}</StMono>}>
      <StCopy muted>{group.summary}</StCopy>
      <StRows label={group.title}>{group.clients.map(client => <StRow key={client.tenantId} title={client.siteName} detail={client.detail} href={`/admin/clients/${encodeURIComponent(client.tenantId)}`} />)}</StRows>
    </StSection>)}
    <StTextButton href="/workspace">Open business workspace</StTextButton>
  </StSection>;
}
