"use client";

import { useState, type ReactNode } from "react";
import { ShieldAlert, Menu } from "lucide-react";
import { HistorySidebar } from "./HistorySidebar";
import { MobileNav } from "./MobileNav";
import { SectionSubNav } from "./SectionSubNav";
import { useDashboard } from "./DashboardContext";

interface ConversationShellProps {
  children: ReactNode;
  businessName: string;
  accountName: string;
  accountEmail?: string | null;
  isSuperAdmin?: boolean;
  pendingCount?: number;
}

export function ConversationShell({
  children,
  businessName,
  accountName,
  accountEmail,
  isSuperAdmin = false,
  pendingCount = 0,
}: ConversationShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Admins can preview the dashboard exactly as the client sees it — hides the
  // admin chrome (impersonation banner + Admin badge). Cosmetic only; it changes
  // nothing about permissions or what the API will accept.
  const [viewAsClient, setViewAsClient] = useState(false);
  const { impersonation } = useDashboard();

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-base text-warm-black" data-dashboard>
      {/* Navigation sidebar */}
      <HistorySidebar
        businessName={businessName}
        accountName={accountName}
        accountEmail={accountEmail}
        isSuperAdmin={isSuperAdmin}
        viewAsClient={viewAsClient}
        onToggleViewAsClient={isSuperAdmin ? () => setViewAsClient((v) => !v) : undefined}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingCount={pendingCount}
      />

      {/* Main content area */}
      <main id="main-content" className="flex-1 flex flex-col min-w-0 dashboard-gradient">
        {impersonation.isActive && !viewAsClient && (
          <div className="shrink-0 border-b border-amber-400/30 bg-amber-300/12 px-4 py-2 text-amber-100">
            <div className="flex items-center gap-2 text-[12px]">
              <ShieldAlert className="h-4 w-4 text-amber-200" strokeWidth={1.7} />
              <span className="font-medium text-amber-50">Acting as Strelva admin</span>
              <span className="hidden sm:inline text-amber-100/80">
                {impersonation.actorEmail || "Super admin"} is viewing tenant {impersonation.tenantId}. Admin saves are audit logged.
              </span>
            </div>
          </div>
        )}

        {/* Mobile header with menu toggle */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-glass-border bg-surface-base/90 backdrop-blur-xl shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <div className="min-w-0">
            <span className="block text-[13px] font-medium text-warm-black leading-tight truncate">{businessName || "Dashboard"}</span>
            <span className="block text-[11px] text-gray-muted leading-tight truncate">Hello, {accountName.trim().split(/\s+/)[0] || "there"}</span>
          </div>
        </header>

        {/* Secondary nav for consolidated tabs (Website / Analytics); null elsewhere */}
        <SectionSubNav />

        {/* Content — add bottom padding on mobile for tab bar */}
        <div className="flex-1 min-h-0 pb-16 lg:pb-0">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <MobileNav />
    </div>
  );
}
