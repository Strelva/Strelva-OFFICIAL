import { listPendingDigests } from "@/lib/maintenance-digest";
import { MaintenanceDigests } from "./MaintenanceDigests";

/** Operator review of the weekly autonomous-maintenance digests. The admin
 *  layout already gates super-admin access. */
export default async function DigestsPage() {
  const digests = await listPendingDigests();
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-warm-white">Maintenance digests</h1>
        <p className="mt-1 text-[13px] text-gray-muted">
          The upkeep each site needs this week. Approve to send the work to the owner&apos;s dashboard
          and the AI; dismiss to skip it.
        </p>
      </div>
      <MaintenanceDigests initialDigests={digests} />
    </div>
  );
}
