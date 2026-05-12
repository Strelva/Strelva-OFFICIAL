import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getContent } from "@/lib/storage";
import { getEvents, getQueueCount } from "@/lib/events";
import { getSectionTimestamps } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { detectStaleSections } from "@/lib/reports";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import type { ContentSection } from "@/lib/types";
import { ChatPageClient } from "./ChatPageClient";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; needs?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getTenantFromHeaders();

  const allowed = await hasTenantAccess(tenant);
  if (!allowed) {
    const clientFallbackRoot = getClientFallbackRoot(await headers());
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  let ownerName = "there";
  try {
    const settings = await getContent("settings", tenant);
    ownerName = settings.ownerName || ownerName;
  } catch {}
  const siteModel = await getTemplateForTenant(tenant);
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
    siteModel.contentSections as ContentSection[]
  ).length;

  return (
    <ChatPageClient
      threadId={params.thread}
      ownerName={ownerName}
      needsYou={{
        openInitially: params.needs === "1",
        pending,
        resolved,
        pendingCount,
        staleSectionCount,
      }}
    />
  );
}
