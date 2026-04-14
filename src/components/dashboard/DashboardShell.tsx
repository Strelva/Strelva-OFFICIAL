"use client";

import { DashboardNav } from "./DashboardNav";

interface DashboardShellProps {
  siteName: string;
  bookingUrl?: string;
  siteUrl?: string;
  children: React.ReactNode;
}

export function DashboardShell({ siteName, bookingUrl, siteUrl, children }: DashboardShellProps) {
  return (
    <div data-dashboard className="flex flex-col h-screen bg-surface-base">
      <DashboardNav siteName={siteName} bookingUrl={bookingUrl} siteUrl={siteUrl} />
      <main className="flex-1 min-h-0 overflow-hidden w-full flex flex-col pb-14 lg:pb-0">{children}</main>
    </div>
  );
}
