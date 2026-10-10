import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { MaintenanceDigests } from "./MaintenanceDigests";

import { StHead, StPage } from "@/components/ui/strelva/Kit";

/** Operator review of the weekly autonomous-maintenance digests. The admin
 *  layout already gates super-admin access. */
export default async function DigestsPage() {
  await authorizeAdminOperatorRead("admin.digests.read");
  const digests = await listPendingDigests();
  return <StPage><StHead title="Maintenance digests" meta="The upkeep each site needs this week. Approve to put proposed work in the owner’s dashboard for review; dismiss to skip it." /><MaintenanceDigests initialDigests={digests} /></StPage>;
}
