"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, MessageCircle, ShieldAlert } from "lucide-react";
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
}

export function ConversationShell({
  children, businessName, accountName, accountEmail, isSuperAdmin = false,
  pendingCount = 0, hasStore = false, inspect = false, inspectTenantName,
  inspectExitHref, appBase = "", signedIn = true, signOut,
}: ConversationShellProps) {
  // Cosmetic client preview does not change the actor or server authorization.
  const [viewAsClient, setViewAsClient] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const hydrationReady = useHydrationReady();
  const pathname = usePathname();
  const discussionTriggerRef = useRef<HTMLButtonElement>(null);
  const { dashboardBasePath, impersonation, relationship } = useDashboard();
  const effectivePathname = dashboardBasePath && pathname?.startsWith(dashboardBasePath)
    ? pathname.slice(dashboardBasePath.length) || "/dashboard" : pathname || "";
  const isChatRoute = effectivePathname === "/dashboard/chat" || effectivePathname.startsWith("/dashboard/chat/");

  useEffect(() => {
    if (!isChatRoute) return;
    const frame = window.requestAnimationFrame(() => setDiscussionOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [isChatRoute]);

  const relationshipLabel = relationship && relationship.status !== "user" ? RELATIONSHIP_STATUS_LABELS[relationship.status] : null;

  return (
    <StrelvaShell
      active="work"
      title={MANAGED_WEBSITES_LABEL}
      appBase={appBase}
      signedIn={signedIn}
      signOut={signOut}
      accountName={accountName}
      accountDetail={[accountEmail, relationshipLabel].filter(Boolean).join(" · ") || undefined}
      context={<PropertySwitcher fallbackName={businessName} />}
      navigation={<ManagedNavigation businessName={businessName} pendingCount={pendingCount} isSuperAdmin={isSuperAdmin} viewAsClient={viewAsClient} onToggleViewAsClient={() => setViewAsClient((value) => !value)} appBase={appBase} />}
      contentId="main-content"
      notice={<>
        {inspect && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/12 px-6 py-3 text-[12px] text-warning">
          <Eye size={16} aria-hidden="true" /><strong className="font-medium">Inspecting {inspectTenantName || businessName}</strong><span>Operator preview</span>
          {inspectExitHref && <a className="ml-auto inline-flex min-h-10 items-center rounded-xl px-4 underline underline-offset-4" href={inspectExitHref}>Exit inspection</a>}
        </div>}
        {impersonation.isActive && !viewAsClient && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/12 px-6 py-3 text-[12px] text-warning">
          <ShieldAlert size={16} aria-hidden="true" /><strong className="font-medium">Acting as Strelva admin</strong>
          <span>{impersonation.actorEmail || "Super admin"} is viewing {businessName}. Admin saves are audit logged.</span>
        </div>}
      </>}
      actions={!isChatRoute ? <button
        ref={discussionTriggerRef} type="button" onClick={() => setDiscussionOpen((open) => !open)} disabled={!hydrationReady}
        className="inline-flex shrink-0 items-center gap-2 border border-gray-border bg-surface-raised text-warm-black hover:border-accent/35"
        aria-expanded={discussionOpen} aria-controls="managed-discussion"
      ><MessageCircle size={16} aria-hidden="true" /><span>Ask Strelva</span></button> : undefined}
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
