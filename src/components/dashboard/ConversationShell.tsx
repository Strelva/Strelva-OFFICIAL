"use client";

import { useState, type ReactNode } from "react";
import { DashNote, DashShellNotes } from "./xa/DashboardXa";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { MANAGED_WEBSITES_LABEL } from "@/products/managed-presence";
import { RELATIONSHIP_STATUS_LABELS } from "@/platform/relationships";
import { ManagedNavigation } from "./ManagedNavigation";
import { PropertySwitcher } from "./PropertySwitcher";
import { SectionSubNav } from "./SectionSubNav";
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

/**
 * The shell for a tenant with no business workspace (every linked tenant is
 * redirected into the workspace; see routeDashboardRequest). October 16: one
 * way to ask, as in the workspace: New request in the sidebar opens the full
 * conversation, and Home has its composer. No header button or side chat.
 */
export function ConversationShell({
  children, businessName, accountName, accountEmail, isSuperAdmin = false,
  pendingCount = 0, hasStore = false, inspect = false, inspectTenantName,
  inspectExitHref, appBase = "", signedIn = true, signOut, mode, notes,
}: ConversationShellProps) {
  // Cosmetic client preview does not change the actor or server authorization.
  const [viewAsClient, setViewAsClient] = useState(false);
  const { tenantId, dashboardHref, impersonation, relationship } = useDashboard();

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
      accountDetail={[accountEmail, relationshipLabel].filter(Boolean).join(" · ") || undefined}
      context={<PropertySwitcher fallbackName={businessName} />}
      navigation={<ManagedNavigation businessName={businessName} pendingCount={pendingCount} isSuperAdmin={isSuperAdmin} viewAsClient={viewAsClient} onToggleViewAsClient={() => setViewAsClient((value) => !value)} appBase={appBase} />}
      contentId="main-content"
      notice={shellNotes}
    >
      <SectionSubNav hasStore={hasStore} />
      <div className="flex min-h-0 flex-1">{children}</div>
    </StrelvaShell>
  );
}
