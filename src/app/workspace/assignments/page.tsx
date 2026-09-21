import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { OperationalInbox } from "@/experience/operations/OperationalInbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Assigned work", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function WorkspaceAssignmentsPage() {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) redirect("/sign-in?next=%2Fworkspace%2Fassignments");
  return <StrelvaShell title="Assigned work" accountName={user.email} accountDetail="Exact work addressed to you">
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-8 lg:px-12 lg:py-12">
        <header className="border-b border-gray-border pb-8">
          <p className="text-[14px] font-medium leading-5 text-accent-text">Your work inbox</p>
          <h1 className="mt-4 font-display text-[40px] font-normal leading-[48px] text-warm-black">Assigned work</h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">Work appears here only when an approved assignment or provider request addresses this verified account. Acceptance remains explicit.</p>
        </header>
        <section className="py-8"><OperationalInbox mode="assigned" /></section>
      </div>
    </div>
  </StrelvaShell>;
}
