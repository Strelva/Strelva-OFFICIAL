import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { LeadsView } from "./LeadsView";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  await authorizeAdminOperatorRead("admin.leads.read");
  const leads = await getDeliveryLeads();
  const workflow = await getAllLeadWorkflow(leads.map((l) => l.statusToken));

  return <LeadsView leads={leads} initialWorkflow={workflow} />;
}
