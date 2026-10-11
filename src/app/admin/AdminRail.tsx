"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Building2, Inbox, UserPlus, CreditCard, BarChart3,
  Zap, FileText, Wrench, Activity, ScrollText, Globe, BriefcaseBusiness, MessageSquareText, ListChecks, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import styles from "@/experience/operations/operator-frame.module.css";
import { LogoMark } from "@/components/Logo";

import { OPERATOR_DESTINATIONS, operatorDestination, operatorDestinations, type OperatorDestination } from "@/experience/operator/destinations";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid, queue: ListChecks, checks: Activity, sites: Globe,
  inquiries: MessageSquareText, billing: Building2, policy: ShieldCheck,
  work: BriefcaseBusiness, audits: ScrollText, analytics: BarChart3,
  payment: CreditCard, actions: Zap, onboard: UserPlus, prospects: Inbox,
  drafts: FileText, maintenance: Wrench,
};

/** Compatibility view for existing consumers; the registry owns every name. */
export const NAV = Array.from(new Set(operatorDestinations({ moneyEnabled: true }).map(item => item.group)))
  .map(label => ({ label, items: operatorDestinations({ moneyEnabled: true }).filter(item => item.group === label) }));

/** The cairn brandmark + wordmark, linking home. The pebble uses the
 *  marketing-scoped --m-accent, remapped to the dashboard accent here. */
export function RailBrand({ preview = false }: { preview?: boolean }) {
  return <Link href={preview ? "/preview/strelva/operator-queue" : "/admin"} className={styles.brand}><LogoMark className="size-5" /><span>Strelva</span></Link>;
}

export function NavList({ badges, onNavigate, moneyEnabled = false, preview = false }: { moneyEnabled?: boolean; badges: Record<string, number | undefined>; onNavigate?: () => void; preview?: boolean }) {
  const pathname = usePathname() || "";
  const destinations = operatorDestinations({ moneyEnabled, preview });
  const primary = destinations.filter(item => item.primary);
  const render = (item: OperatorDestination) => {
    const Icon = ICONS[item.icon] ?? Globe;
    const selected = preview ? pathname === item.href : operatorDestination(pathname)?.href === item.href;
    return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={selected ? "page" : undefined} className={styles.link}><Icon size={16} aria-hidden="true" /><span>{item.label}</span>{item.badgeKey && badges[item.badgeKey] ? <span className="ml-auto">{badges[item.badgeKey]}</span> : null}</Link>;
  };
  const more = destinations.filter(item => !item.primary);
  return <nav aria-label="Strelva operations" className={styles.nav}>{primary.map(render)}{!preview && <details className={styles.more}><summary>More destinations</summary>{Array.from(new Set(more.map(item => item.group))).map(group => <div key={group}><p className="px-3 py-2 text-xs text-gray-muted">{group}</p>{more.filter(item => item.group === group).map(render)}</div>)}</details>}</nav>;
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
    {clients.length > 0 && <nav aria-label={OPERATOR_DESTINATIONS.sites.label} className={styles.clients}>{clients.map(client => <Link key={client.id} href={preview ? `/preview/strelva/operator-client?client=${client.id}` : `/admin/clients/${client.id}`} className={styles.link} aria-current={pathname.endsWith(`/${client.id}`) ? "page" : undefined}><span className={styles.avatar}>{client.siteName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span>{client.siteName}</Link>)}</nav>}
    <p className={styles.note}>Operator powers are separate from any agency, logged, and never used to sell to or serve a client.</p>
    <RailFooter operatorName={operatorName} />
  </aside>;
}
