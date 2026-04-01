"use client";

import { DashboardNav } from "./DashboardNav";

interface DashboardShellProps {
  siteName: string;
  children: React.ReactNode;
}

export function DashboardShell({ siteName, children }: DashboardShellProps) {
  return (
    <div className="flex flex-col h-screen bg-[#faf9f7]">
      <DashboardNav siteName={siteName} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
