import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasDashboardViewAccess } from "@/lib/auth";
import { getEvents, getQueueCount } from "@/lib/events";
import { getSectionTimestamps } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { detectStaleSections } from "@/lib/reports";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { QueueSkeleton } from "@/components/dashboard/QueueSkeleton";
import type { ContentSection } from "@/lib/types";

async function QueueContent() {
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasDashboardViewAccess(tenant);
  if (!hasAccess) {
    const clientFallbackRoot = getClientFallbackRoot(await headers());
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  const siteModel = await getTemplateForTenant(tenant);
  const [pending, resolved, pendingCount, timestamps] = await Promise.all([
    getEvents(tenant, { status: "pending", limit: 50 }).catch(() => []),
    getEvents(tenant, { limit: 30 })
      .then((events) =>
        events.filter((e) => e.status === "approved" || e.status === "dismissed" || e.status === "auto_approved")
      )
      .catch(() => []),
    getQueueCount(tenant).catch(() => 0),
    getSectionTimestamps(tenant).catch(() => ({})),
  ]);
  const staleSectionCount = detectStaleSections(
    timestamps,
    siteModel.contentSections as ContentSection[]
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
