import { Suspense } from "react";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getNeedsYouData } from "@/lib/needs-you";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { QueueSkeleton } from "@/components/dashboard/QueueSkeleton";

async function QueueContent() {
  const { tenant } = await requireDashboardView();

  const { pending, resolved, pendingCount, staleSectionCount } = await getNeedsYouData(tenant);

  return (
    <QueuePage
      initialPending={pending}
      initialResolved={resolved}
      pendingCount={pendingCount}
      staleSectionCount={staleSectionCount}
    />
  );
}

export default function QueueRoute() {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueContent />
    </Suspense>
  );
}
