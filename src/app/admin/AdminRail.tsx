"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Users, Building2, Inbox, UserPlus, CreditCard, BarChart3,
  Zap, FileText, Wrench, Activity, ScrollText, Globe, BriefcaseBusiness, MessageSquareText, ListChecks, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import styles from "@/experience/operations/operator-frame.module.css";
import { LogoMark } from "@/components/Logo";

interface Item { href: string; label: string; icon: LucideIcon; exact?: boolean; badgeKey?: string; hot?: boolean }
interface Group { label?: string; items: Item[] }

// Nav is grouped by responsibility, not hidden behind a "More" menu: delivery,
// customer support, then restricted system administration.
export const NAV: Group[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/admin/queue", label: "Queue", icon: ListChecks },
      { href: "/admin/needs-you", label: "Who decides", icon: ShieldCheck },
      { href: "/admin/work", label: "Internal work", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/admin/actions", label: "Managed-site work", icon: Zap, badgeKey: "actions", hot: true },
      { href: "/admin/websites", label: "Website rebuilds", icon: Globe },
      { href: "/admin/drafts", label: "Drafts", icon: FileText },
      { href: "/admin/digests", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/clients", label: "Clients", icon: Users, badgeKey: "clients" },
      { href: "/admin/client-leads", label: "Client leads", icon: MessageSquareText },
      { href: "/admin/accounts", label: "Accounts", icon: Building2, badgeKey: "accounts" },
      { href: "/admin/leads", label: "Leads", icon: Inbox, badgeKey: "leads" },
      { href: "/admin/onboard", label: "Onboard", icon: UserPlus },
      { href: "/admin/pay-links", label: "Pay links", icon: CreditCard },
      { href: "/admin/money", label: "Money records", icon: CreditCard },
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
export function RailBrand({ preview = false }: { preview?: boolean }) {
  return <Link href={preview ? "/preview/strelva/operator-queue" : "/admin"} className={styles.brand}><LogoMark className="size-5" /><span>Strelva</span></Link>;
}

export function NavList({ badges, onNavigate, moneyEnabled = false, preview = false }: { moneyEnabled?: boolean; badges: Record<string, number | undefined>; onNavigate?: () => void; preview?: boolean }) {
  const pathname = usePathname() || "";
  const primary: Item[] = [
    { href: preview ? "/preview/strelva/operator-queue" : "/admin/queue", label: "Queue", icon: ListChecks },
    { href: preview ? "/preview/strelva/operator-checks" : "/admin/uptime", label: "Checks", icon: Activity },
    { href: preview ? "/preview/strelva/operator-client" : "/admin/clients", label: "Clients", icon: Building2 },
  ];
  const render = (item: Item) => { const Icon = item.icon; const selected = active(pathname, item); return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={selected ? "page" : undefined} className={styles.link}><Icon size={16} aria-hidden="true" /><span>{item.label}</span>{item.badgeKey && badges[item.badgeKey] ? <span className="ml-auto">{badges[item.badgeKey]}</span> : null}</Link>; };
  return <nav aria-label="Strelva operations" className={styles.nav}>{primary.map(render)}{!preview && <details className={styles.more}><summary>More operations</summary>{NAV.flatMap(group => group.items).filter(item => !primary.some(p => p.href === item.href) && (item.href !== "/admin/money" || moneyEnabled)).map(render)}</details>}</nav>;
}

export function RailFooter({ operatorName }: { operatorName: string }) {
  return <div className={styles.footer}><span className={styles.avatar}>{operatorName.charAt(0).toUpperCase()}</span><span>{operatorName} on duty</span></div>;
}

export function AdminRail({ operatorName = "Operator", badges = {}, moneyEnabled = false, preview = false, clients = [] }: { moneyEnabled?: boolean; operatorName?: string; badges?: Record<string, number | undefined>; preview?: boolean; clients?: readonly { id: string; siteName: string }[] }) {
  const pathname = usePathname() || "";
  return <aside data-workspace-theme="linen" data-workspace-mode="dark" className={styles.rail}>
    <RailBrand preview={preview} />
    <div className={styles.scope}><span className={styles.avatar}>S</span>Strelva operations</div>
    <NavList badges={badges} moneyEnabled={moneyEnabled} preview={preview} />
    {clients.length > 0 && <nav aria-label="Clients" className={styles.clients}>{clients.map(client => <Link key={client.id} href={preview ? `/preview/strelva/operator-client?client=${client.id}` : `/admin/clients/${client.id}`} className={styles.link} aria-current={pathname.endsWith(`/${client.id}`) ? "page" : undefined}><span className={styles.avatar}>{client.siteName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span>{client.siteName}</Link>)}</nav>}
    <p className={styles.note}>Operator powers are separate from any agency, logged, and never used to sell to or serve a client.</p>
    <RailFooter operatorName={operatorName} />
  </aside>;
}
