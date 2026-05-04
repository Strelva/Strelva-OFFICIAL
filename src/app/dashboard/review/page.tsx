import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getEvents, getQueueCount } from "@/lib/events";
import { getSectionTimestamps } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { detectStaleSections } from "@/lib/reports";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { QueueSkeleton } from "@/components/dashboard/QueueSkeleton";
import type { ContentSection } from "@/lib/types";

async function QueueContent() {
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) redirect("/no-access");

  const template = await getTemplateForTenant(tenant);
  const [pending, resolved, pendingCount, timestamps] = await Promise.all([
    getEvents(tenant, { status: "pending", limit: 50 }),
    getEvents(tenant, { limit: 30 }).then((events) =>
      events.filter((e) => e.status === "approved" || e.status === "dismissed" || e.status === "auto_approved")
    ),
    getQueueCount(tenant),
    getSectionTimestamps(tenant),
  ]);
  const staleSectionCount = detectStaleSections(
    timestamps,
    template.contentSections as ContentSection[]
  ).length;

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
