import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { MaintenanceDigests } from "./MaintenanceDigests";

import { StHead, StPage } from "@/components/ui/strelva/Kit";

// Operator authority and pending digests must be evaluated for each request.
export const dynamic = "force-dynamic";

/** Operator review of the weekly autonomous-maintenance digests. The admin
 *  layout already gates super-admin access. */
export default async function DigestsPage() {
  await authorizeAdminOperatorRead("admin.digests.read");
  const digests = await listPendingDigests();
  return <StPage><StHead title={OPERATOR_DESTINATIONS.maintenance.label} meta="Inspect the upkeep each site needs this week. The business owner decides what changes." /><MaintenanceDigests initialDigests={digests} /></StPage>;
}
