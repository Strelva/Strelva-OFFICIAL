import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { MaintenanceDigests } from "./MaintenanceDigests";

// Operator authority and pending digests must be evaluated for each request.
export const dynamic = "force-dynamic";

/** Operator review of the weekly autonomous-maintenance digests. The admin
 *  layout already gates super-admin access. */
export default async function DigestsPage() {
  await authorizeAdminOperatorRead("admin.digests.read");
  const digests = await listPendingDigests();
  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Maintenance digests</h1>
        <p className="mt-1 text-[13px] text-gray-muted">
          The upkeep each site needs this week. Approve to send the work to the owner&apos;s dashboard
          and the AI; dismiss to skip it.
        </p>
      </div>
      <MaintenanceDigests initialDigests={digests} />
    </div>
  );
}
