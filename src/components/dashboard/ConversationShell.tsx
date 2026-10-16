"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { XaButton } from "@/components/ui/strelva/Xa";
import { DashNote, DashShellNotes } from "./xa/DashboardXa";
import { useHydrationReady } from "@/experience/app-frame";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { MANAGED_WEBSITES_LABEL } from "@/products/managed-presence";
import { RELATIONSHIP_STATUS_LABELS } from "@/platform/relationships";
import { ManagedNavigation } from "./ManagedNavigation";
import { PropertySwitcher } from "./PropertySwitcher";
import { SectionSubNav } from "./SectionSubNav";
import { ChatPanel } from "./ChatPanel";
import { useDashboard } from "./DashboardContext";

interface ConversationShellProps {
  children: ReactNode;
  businessName: string;
  businessLogoUrl?: string;
  accountName: string;
  accountEmail?: string | null;
  isSuperAdmin?: boolean;
  pendingCount?: number;
  hasStore?: boolean;
  inspect?: boolean;
  inspectTenantName?: string;
  inspectExitHref?: string;
  /** Canonical shared app origin when a managed website is on a customer host. */
  appBase?: string;
  signedIn?: boolean;
  signOut?: ReactNode;
  /** Light or dark (data-workspace-mode); previews pass it, the account's choice later. */
  mode?: "light" | "dark";
  /** Extra shell-level sentences (billing, the move to the workspace), shown above the page. */
  notes?: ReactNode;
}

export function ConversationShell({
  children, businessName, accountName, accountEmail, isSuperAdmin = false,
  pendingCount = 0, hasStore = false, inspect = false, inspectTenantName,
  inspectExitHref, appBase = "", signedIn = true, signOut, mode, notes,
}: ConversationShellProps) {
  // Cosmetic client preview does not change the actor or server authorization.
  const [viewAsClient, setViewAsClient] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const hydrationReady = useHydrationReady();
  const pathname = usePathname();
  const discussionTriggerRef = useRef<HTMLButtonElement>(null);
  const { tenantId, dashboardBasePath, dashboardHref, impersonation, relationship } = useDashboard();
  const effectivePathname = dashboardBasePath && pathname?.startsWith(dashboardBasePath)
    ? pathname.slice(dashboardBasePath.length) || "/dashboard" : pathname || "";
  const isChatRoute = effectivePathname === "/dashboard/chat" || effectivePathname.startsWith("/dashboard/chat/");

  useEffect(() => {
    if (!isChatRoute) return;
    const frame = window.requestAnimationFrame(() => setDiscussionOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [isChatRoute]);

  const relationshipLabel = relationship && relationship.status !== "user" ? RELATIONSHIP_STATUS_LABELS[relationship.status] : null;

  const showAdmin = impersonation.isActive && !viewAsClient;
  const shellNotes = inspect || showAdmin || notes ? <DashShellNotes>
    {inspect ? <DashNote tone="waits" links={inspectExitHref ? [<a key="exit" href={inspectExitHref} className="font-medium text-[var(--st-accent)] hover:underline">Stop inspecting</a>] : undefined}>You are inspecting {inspectTenantName || businessName} as Strelva. The owner does not see this line.</DashNote> : null}
    {showAdmin ? <DashNote tone="waits">{impersonation.actorEmail || "A Strelva admin"} is working in {businessName} as Strelva. Every save names Strelva in History.</DashNote> : null}
    {notes}
  </DashShellNotes> : undefined;

  return (
    <StrelvaShell
      tenantId={tenantId}
      theme="linen"
      mode={mode}
      navigationOnly
      accountHref={dashboardHref("/dashboard/settings")}
      workspaceName={businessName}
      active="work"
      title={MANAGED_WEBSITES_LABEL}
      appBase={appBase}
      signedIn={signedIn}
      signOut={signOut}
      accountName={accountName}
      // One fact fits the rail's footer whole: the email when known, else the relationship. Two joined got cut mid-word.
      accountDetail={accountEmail || relationshipLabel || undefined}
      context={<PropertySwitcher fallbackName={businessName} />}
      navigation={<ManagedNavigation businessName={businessName} pendingCount={pendingCount} isSuperAdmin={isSuperAdmin} viewAsClient={viewAsClient} onToggleViewAsClient={() => setViewAsClient((value) => !value)} appBase={appBase} />}
      contentId="main-content"
      notice={shellNotes}
      actions={!isChatRoute ? <XaButton
        ref={discussionTriggerRef} size="sm" onClick={() => setDiscussionOpen((open) => !open)} disabled={!hydrationReady}
        aria-expanded={discussionOpen} aria-controls="managed-discussion"
      ><MessageCircle size={15} aria-hidden="true" />Ask Strelva</XaButton> : undefined}
      rightRail={!isChatRoute ? <OptionalManagedDiscussion open={discussionOpen} ownerName={accountName} /> : undefined}
      rightRailOpen={!isChatRoute && discussionOpen}
      onCloseRightRail={() => setDiscussionOpen(false)}
      rightRailTriggerRef={discussionTriggerRef}
    >
      <SectionSubNav hasStore={hasStore} />
      <div className="flex min-h-0 flex-1">{children}</div>
    </StrelvaShell>
  );
}

/** Keep the tenant conversation dormant until requested; never mount two chats. */
function OptionalManagedDiscussion({ open, ownerName }: { open: boolean; ownerName: string }) {
  return open ? <ChatPanel ownerName={ownerName} variant="compact" /> : null;
}
