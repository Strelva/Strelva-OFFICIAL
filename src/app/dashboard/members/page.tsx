import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { listMembers } from "@/lib/rewards/memberRepositoryKv";
import { KvNotConfiguredError } from "@/lib/rewards/kv";
import { MembersPanel } from "@/components/dashboard/MembersPanel";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function MembersPage() {
  const { tenant, preview } = await requireDashboardFeature("members");

  // The members/points backend is KV-gated: listMembers throws
  // KvNotConfiguredError when membership isn't wired for this site. Treat that —
  // and any other backend blip — as "not set up" so the tab is always honest and
  // never crashes or shows a fake promise. A real (possibly empty) list means the
  // program IS configured, which MembersPanel renders read-only.
  let members;
  try {
    members = await listMembers(tenant);
  } catch (err) {
    if (!(err instanceof KvNotConfiguredError)) {
      console.error("[dashboard members]", err);
    }
    return (
      <>
        {preview && <InspectPreviewBanner tenant={tenant} featureId="members" />}
        <MembersPanel configured={false} />
      </>
    );
  }

  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="members" />}
      <MembersPanel configured members={members} />
    </>
  );
}
