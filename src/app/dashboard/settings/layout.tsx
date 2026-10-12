import type { ReactNode } from "react";
import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";

/**
 * Settings is a client page, so its move check lives here: where owner entry
 * is on, /dashboard/settings goes to Business details (owner-entry spec §5).
 * The dashboard layout covers a full load; this covers a soft navigation.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/settings");
  return children;
}
