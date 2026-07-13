"use client";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

export function AccountSection() {
  const dashboard = useDashboardOptional();
  const name = dashboard?.impersonation.actorName?.trim() || "You";
  const email = dashboard?.impersonation.actorEmail || null;
  const isAdmin = dashboard?.impersonation.isSuperAdmin ?? false;

  return (
    <div className="rounded-xl border border-glass-border bg-glass p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-dim text-[15px] font-semibold text-accent">
          {(name[0] || "U").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-medium text-warm-white">{name}</p>
            {isAdmin && (
              <span className="shrink-0 rounded-full bg-accent-dim px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">
                Strelva Admin
              </span>
            )}
          </div>
          {email && <p className="truncate text-[12px] text-gray-muted">{email}</p>}
        </div>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-gray-muted">
        This is the account you&apos;re signed in with — it stays the same across every
        business you can access. Your business&apos;s public details live in{" "}
        <span className="text-warm-white">Business info</span>.
      </p>
    </div>
  );
}
