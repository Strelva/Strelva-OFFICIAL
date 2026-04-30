import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getEvents, getQueueCount } from "@/lib/events";
import { QueuePage } from "@/components/dashboard/QueuePage";

export default async function QueueRoute() {
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) redirect("/");

  const [pending, resolved, pendingCount] = await Promise.all([
    getEvents(tenant, { status: "pending", limit: 50 }),
    getEvents(tenant, { limit: 30 }).then((events) =>
      events.filter((e) => e.status === "approved" || e.status === "dismissed" || e.status === "auto_approved")
    ),
    getQueueCount(tenant),
  ]);

  return (
    <QueuePage
      initialPending={pending}
      initialResolved={resolved}
      pendingCount={pendingCount}
    />
  );
}
