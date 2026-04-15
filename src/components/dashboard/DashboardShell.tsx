"use client";

import { DashboardSidebar } from "./DashboardSidebar";

interface DashboardShellProps {
  siteName: string;
  ownerName?: string;
  bookingUrl?: string;
  siteUrl?: string;
  children: React.ReactNode;
}

export function DashboardShell({ siteName, ownerName, children }: DashboardShellProps) {
  return (
    <div data-dashboard className="flex h-screen bg-surface-base">
      <DashboardSidebar siteName={siteName} ownerName={ownerName} />
      <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col pb-16 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
