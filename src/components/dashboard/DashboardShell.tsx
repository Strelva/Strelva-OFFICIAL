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
    <div className="flex flex-col h-screen bg-[#faf9f7]">
      <DashboardNav siteName={siteName} bookingUrl={bookingUrl} siteUrl={siteUrl} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
