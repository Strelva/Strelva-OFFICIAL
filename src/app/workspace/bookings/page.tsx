import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readWorkspaceBookings, type BookingView } from "@/products/bookings/server";
import { WorkspaceBookings, type WorkspaceBookingsState } from "@/experience/bookings/WorkspaceBookings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The workspace home of /dashboard/roster (day view) and /dashboard/schedule (week view), owner-entry spec §5. */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const view: BookingView = params.view === "day" ? "day" : "week";
  const date = typeof params.date === "string" && DATE.test(params.date) ? params.date : null;
  const source = params.source === "agent" ? "agent" : "all";
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) {
    redirect(`/sign-in?next=${encodeURIComponent(`/workspace/bookings?${new URLSearchParams({ workspaceId, view, ...(date ? { date } : {}), ...(source === "agent" ? { source } : {}) })}`)}`);
  }
  let state: WorkspaceBookingsState;
  try {
    state = { kind: "ready", bookings: await readWorkspaceBookings({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId, { view, date, source }) };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) state = { kind: "permission" };
    else {
      console.error("[bookings] page read failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
      state = { kind: "error" };
    }
  }
  return <WorkspaceBookings workspaceId={workspaceId} state={state} view={view} />;
}
