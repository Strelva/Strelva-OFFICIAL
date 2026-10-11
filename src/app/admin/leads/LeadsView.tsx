import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { LeadWorkflow } from "@/lib/lead-workflow";
import { StEmpty, StHead, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import { LeadRows } from "./LeadRows";

export function LeadsView({ leads, initialWorkflow, readOnly = false }: { leads: DeliveryLead[]; initialWorkflow: Record<string, LeadWorkflow>; readOnly?: boolean }) {
  const counts = ["new", "contacted", "converting"].map(status => ({ status, count: leads.filter(lead => (initialWorkflow[lead.statusToken]?.status ?? "new") === status).length })).filter(item => item.count > 0);
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.prospects.label} meta={`Strelva Agency · ${counts.length ? counts.map(item => `${item.count} ${item.status}`).join(" · ") : "People who requested a site. Review their request and delivery status."}`} />
    {leads.length ? <LeadRows leads={leads} initialWorkflow={initialWorkflow} readOnly={readOnly} /> : <StEmpty action={<StTextButton href="/audit">Open the audit tool</StTextButton>}>No prospects yet. Access requests from potential clients appear here.</StEmpty>}
  </StPage>;
}
