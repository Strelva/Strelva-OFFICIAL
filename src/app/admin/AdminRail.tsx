"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid, Users, Inbox, BarChart3, Zap, Activity,
  ArrowRight, ChevronDown, type LucideIcon,
} from "lucide-react";

interface Item { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number; hot?: boolean }

const PRIMARY = (badges: Record<string, number | undefined>): Item[] => [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/clients", label: "Clients", icon: Users, badge: badges.clients },
  { href: "/admin/leads", label: "Leads", icon: Inbox, badge: badges.leads },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/actions", label: "Actions", icon: Zap, badge: badges.actions, hot: true },
  { href: "/admin/ops", label: "Ops", icon: Activity, badge: badges.ops, hot: true },
];

const MORE: { href: string; label: string }[] = [
  { href: "/admin/onboard", label: "Onboard" },
  { href: "/admin/pay-links", label: "Pay Links" },
  { href: "/admin/digests", label: "Maintenance" },
  { href: "/admin/drafts", label: "Drafts" },
  { href: "/admin/audit", label: "Audit" },
];

function active(pathname: string, i: { href: string; exact?: boolean }): boolean {
  return i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/") || pathname.startsWith(i.href);
}

export function AdminRail({
  operatorName = "Operator",
  badges = {},
}: {
  operatorName?: string;
  badges?: Record<string, number | undefined>;
}) {
  const pathname = usePathname() || "";
  const [moreOpen, setMoreOpen] = useState(MORE.some((m) => pathname.startsWith(m.href)));

  return (
    <aside className="sticky top-0 flex h-screen w-full flex-col border-r border-glass-border bg-surface-base px-3 py-[18px]">
      <Link href="/admin" className="mb-5 flex items-center gap-2.5 px-2">
        <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[8px]" style={{ background: "linear-gradient(150deg,#b6cfbf,#6d9080)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f1c15" strokeWidth="2.4"><path d="M4 18L10 7l4 6 2-3 4 8z" /></svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-warm-white">Strelva</span>
          <span className="block text-[10.5px] font-medium tracking-[0.03em] text-gray-faint">Operator console</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-px">
        {PRIMARY(badges).map((i) => {
          const on = active(pathname, i);
          const Icon = i.icon;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-2 text-[13px] font-medium transition-colors ${on ? "bg-accent-dim text-warm-white" : "text-gray-muted hover:bg-glass hover:text-warm-white"}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${on ? "text-accent" : "opacity-80"}`} strokeWidth={1.8} />
              <span>{i.label}</span>
              {typeof i.badge === "number" && i.badge > 0 && (
                <span className={`ml-auto font-mono text-[11px] font-semibold tabular-nums ${i.hot ? "text-critical" : on ? "text-accent" : "text-gray-faint"}`}>{i.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="my-[13px] mx-2 h-px bg-glass-border" />

      <Link href="/account" className="flex items-center gap-[11px] rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-gray-muted transition-colors hover:bg-glass hover:text-warm-white">
        <ArrowRight className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} />
        <span>Client dashboards</span>
      </Link>
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        className="flex items-center gap-[11px] rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-gray-muted transition-colors hover:bg-glass hover:text-warm-white"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-80 transition-transform ${moreOpen ? "" : "-rotate-90"}`} strokeWidth={1.8} />
        <span>More</span>
      </button>
      {moreOpen && (
        <div className="ml-[30px] flex flex-col gap-px">
          {MORE.map((m) => {
            const on = pathname.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} className={`rounded-[8px] px-2.5 py-[7px] text-[12.5px] transition-colors ${on ? "text-warm-white" : "text-gray-faint hover:text-warm-white"}`}>
                {m.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 border-t border-glass-border px-2 pt-[13px]">
        <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[8px] bg-[#242018] font-[family-name:var(--font-display)] text-[12px] font-semibold text-[#d6d0c0]">
          {operatorName.charAt(0).toUpperCase()}
        </span>
        <span className="leading-tight">
          <span className="block text-[12px] font-semibold text-warm-white">{operatorName}</span>
          <span className="block text-[10.5px] text-gray-faint">Super admin</span>
        </span>
      </div>
    </aside>
  );
}
