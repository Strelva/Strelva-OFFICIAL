"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import {
  LayoutGrid, Users, Building2, Inbox, UserPlus, CreditCard, BarChart3,
  Zap, FileText, Wrench, Activity, ScrollText, Globe, BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";

interface Item { href: string; label: string; icon: LucideIcon; exact?: boolean; badgeKey?: string; hot?: boolean }
interface Group { label?: string; items: Item[] }

// Nav is grouped by responsibility, not hidden behind a "More" menu: delivery,
// customer support, then restricted system administration.
export const NAV: Group[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/admin/work", label: "Internal work", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/admin/actions", label: "Managed-site work", icon: Zap, badgeKey: "actions", hot: true },
      { href: "/admin/drafts", label: "Drafts", icon: FileText },
      { href: "/admin/digests", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/clients", label: "Clients", icon: Users, badgeKey: "clients" },
      { href: "/admin/accounts", label: "Accounts", icon: Building2, badgeKey: "accounts" },
      { href: "/admin/leads", label: "Leads", icon: Inbox, badgeKey: "leads" },
      { href: "/admin/onboard", label: "Onboard", icon: UserPlus },
      { href: "/admin/pay-links", label: "Pay links", icon: CreditCard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "System administration",
    items: [
      { href: "/admin/ops", label: "Ops", icon: Activity, badgeKey: "ops", hot: true },
      { href: "/admin/uptime", label: "Uptime", icon: Globe },
      { href: "/admin/audit", label: "Audit", icon: ScrollText },
    ],
  },
];

function active(pathname: string, i: Item): boolean {
  return i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/");
}

/** The cairn brandmark + wordmark, linking home. The pebble uses the
 *  marketing-scoped --m-accent, remapped to the dashboard accent here. */
export function RailBrand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2">
      <span style={{ "--m-accent": "var(--accent)" } as CSSProperties}>
        <LogoMark className="size-[26px] text-warm-white" />
      </span>
      <span className="leading-tight">
        <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-warm-white">Strelva</span>
        <span className="block text-[10.5px] font-medium tracking-[0.03em] text-gray-faint">Operator console</span>
      </span>
    </Link>
  );
}

/** The grouped nav links. Shared by the desktop rail and the mobile drawer.
 *  `onNavigate` lets the drawer close itself on a tap. */
export function NavList({
  badges,
  onNavigate,
}: {
  badges: Record<string, number | undefined>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "";
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {NAV.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-px">
          {group.label && (
            <span className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-gray-faint">
              {group.label}
            </span>
          )}
          {group.items.map((i) => {
            const on = active(pathname, i);
            const Icon = i.icon;
            const badge = i.badgeKey ? badges[i.badgeKey] : undefined;
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-2 text-[13px] font-medium transition-colors ${on ? "bg-accent-dim text-warm-white" : "text-gray-muted hover:bg-glass hover:text-warm-white"}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${on ? "text-accent" : "opacity-80"}`} strokeWidth={1.8} />
                <span>{i.label}</span>
                {typeof badge === "number" && badge > 0 && (
                  <span className={`ml-auto font-mono text-[11px] font-semibold tabular-nums ${i.hot ? "text-critical" : on ? "text-accent" : "text-gray-faint"}`}>{badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function RailFooter({ operatorName }: { operatorName: string }) {
  return (
    <div className="mt-3 flex items-center gap-2.5 border-t border-glass-border px-2 pt-[13px]">
      <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[8px] bg-glass-active font-display text-[12px] font-semibold text-warm-white">
        {operatorName.charAt(0).toUpperCase()}
      </span>
      <span className="leading-tight">
        <span className="block text-[12px] font-semibold text-warm-white">{operatorName}</span>
        <span className="block text-[10.5px] text-gray-faint">Super admin</span>
      </span>
    </div>
  );
}

export function AdminRail({
  operatorName = "Operator",
  badges = {},
}: {
  operatorName?: string;
  badges?: Record<string, number | undefined>;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-full flex-col border-r border-glass-border bg-surface-base px-3 py-[18px] md:flex">
      <div className="mb-5">
        <RailBrand />
      </div>
      <NavList badges={badges} />
      <RailFooter operatorName={operatorName} />
    </aside>
  );
}
