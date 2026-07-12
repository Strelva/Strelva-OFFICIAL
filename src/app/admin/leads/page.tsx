import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { LeadRows } from "./LeadRows";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await getDeliveryLeads();
  const workflow = await getAllLeadWorkflow(leads.map((l) => l.statusToken));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
          Leads
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          {leads.length} lead{leads.length !== 1 ? "s" : ""} from the marketing site, newest first.
          Mark contacted, convert to a client, or dismiss junk.
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No leads yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Contact, discovery, and get-started form submissions land here the moment they come in.
          </p>
        </div>
      ) : (
        <LeadRows leads={leads} initialWorkflow={workflow} />
      )}
    </div>
  );
}
