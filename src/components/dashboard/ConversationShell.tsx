"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { HistorySidebar } from "./HistorySidebar";
import { MobileNav } from "./MobileNav";

interface ConversationShellProps {
  children: ReactNode;
  ownerName: string;
  pendingCount?: number;
  valueProof?: string;
}

export function ConversationShell({
  children,
  ownerName,
  pendingCount = 0,
  valueProof,
}: ConversationShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-base text-warm-black" data-dashboard>
      {/* Navigation sidebar */}
      <HistorySidebar
        ownerName={ownerName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingCount={pendingCount}
        valueProof={valueProof}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 dashboard-gradient">
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
            <span className="block text-[13px] font-medium text-warm-black leading-tight">Scaffold</span>
            <span className="block text-[11px] text-gray-muted leading-tight truncate">{valueProof || "Business OS"}</span>
          </div>
        </header>

        {/* Content — add bottom padding on mobile for tab bar */}
        <div className="flex-1 min-h-0 pb-16 lg:pb-0">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <MobileNav pendingCount={pendingCount} />
    </div>
  );
}
