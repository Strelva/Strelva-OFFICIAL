import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getActivity, getContent } from "@/lib/storage";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getConnections } from "@/lib/connections";

/**
 * First-run onboarding progress for the owner dashboard. Tenant-scoped; gated by
 * tenant access. Computes three real signals so the checklist reflects what the
 * owner has actually done, not a static banner.
 */
export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const [activity, brief, connections, settings] = await Promise.all([
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getWeeklyBrief(tenant).catch(() => null),
    getConnections(tenant).catch(() => []),
    getContent("settings", tenant).catch(() => ({})),
  ]);
  const businessModel = (settings as { businessModel?: string }).businessModel || "";

  const steps = [
    {
      key: "business_type",
      label: "Tell us how customers find you",
      done: Boolean(businessModel),
      href: "/dashboard/settings#profile",
    },
    {
      key: "connect",
      label: "Connect an account so Strelva can manage more for you",
      done: connections.length > 0,
      href: "/dashboard/integrations",
    },
    {
      key: "ai_edit",
      label: "Make your first change with the AI",
      done: activity.length > 0,
      href: "/dashboard/chat",
    },
    {
      key: "report",
      label: "See your first weekly report",
      done: Boolean(brief),
      href: "/dashboard/reports",
    },
  ];

  return NextResponse.json({ steps, complete: steps.every((s) => s.done) });
}
