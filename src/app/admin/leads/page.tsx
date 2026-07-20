import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { LeadRows } from "./LeadRows";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await getDeliveryLeads();
  const workflow = await getAllLeadWorkflow(leads.map((l) => l.statusToken));

  const newCount = leads.filter(
    (l) => (workflow[l.statusToken]?.status ?? "new") === "new",
  ).length;
  const contactedCount = leads.filter(
    (l) => (workflow[l.statusToken]?.status ?? "new") === "contacted",
  ).length;
  const convertingCount = leads.filter(
    (l) => (workflow[l.statusToken]?.status ?? "new") === "converting",
  ).length;

  const summaryParts: string[] = [];
  if (newCount > 0) summaryParts.push(`${newCount} new`);
  if (contactedCount > 0) summaryParts.push(`${contactedCount} contacted`);
  if (convertingCount > 0) summaryParts.push(`${convertingCount} converting`);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
          Leads
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          {leads.length === 0
            ? "No prospects yet. Access requests land here the moment they come in."
            : summaryParts.length > 0
              ? `New client prospects — people who requested a site. ${summaryParts.join(" · ")}.`
              : `${leads.length} prospect${leads.length !== 1 ? "s" : ""} — mark contacted, convert, or dismiss.`}
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No prospects yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Access requests from potential clients land here the moment they come in.
          </p>
        </div>
      ) : (
        <LeadRows leads={leads} initialWorkflow={workflow} />
      )}
    </div>
  );
}
