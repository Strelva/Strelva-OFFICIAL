"use client";
/**
 * XA sidebar (October 15, 2026). Pen: XA · O1 (UTaNw "Sidebar"), XA · AG1
 * (I2nCa), XA · AG3 (GtI53), XA · R1 (U4G9Is, the details sidebar).
 *
 * Three shapes from one contract (StrelvaSidebar's props):
 * - Owner: business switcher, New request, Search, Today, Requests, Minutes,
 *   "Your business" Systems with an exception state, "Your agency", account.
 * - Agency: agency switcher, New request, Search, Today, Queue, Library,
 *   Minutes, Clients (with the one that waits marked), Add a client, account.
 * - Details: the sidebar swaps to Back, Business record, People & access,
 *   Plan and usage, Take it with you (agency: Team, Verification, Leads,
 *   Payment links).
 *
 * Presentation only. Every href comes from workspace-places or the caller,
 * and the caller's server checks remain the authority for each place.
 */
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { ArrowLeft, BadgeCheck, Building2, CircleHelp, CreditCard, FileText, Inbox, Library, ListChecks, Package, Plug, ScrollText, Search, SquarePen, Sun, UserRound, Users, X, type LucideIcon } from "lucide-react";
import { XaAddTile, XaGlideList, XaInitial, XaMark, XaSystemTile } from "@/components/ui/strelva/Xa";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { SYSTEMS_LIST_LABEL } from "@/experience/systems/model";
import { PLACE_LABELS } from "@/platform/presentation/place-labels";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { plainWorkspaceName } from "./workspace-header";
import { placeForSection, workspaceSectionHref, type StrelvaAgencyLink, type StrelvaClientLink, type StrelvaDetailsPlace, type StrelvaPinnedItem, type StrelvaSection } from "./workspace-places";
import styles from "./xa-sidebar.module.css";

type NavigableSection = Exclude<StrelvaSection, "account">;
type AgencyPlace = "clients" | "queue" | "library" | "team" | "home" | "verification" | "minutes";

export interface XaAgencyNavigation {
  paymentLinksCurrent?: boolean;
  leadsAvailable?: boolean;
  leadsCurrent?: boolean;
  active?: AgencyPlace;
  onNavigate?: (view: "clients" | "queue" | "library" | "team") => void;
  hrefs?: Partial<Record<AgencyPlace, string>>;
  /** XA: the agency's clients, read through ordinary agency scope. */
  clients?: readonly StrelvaClientLink[];
  /** XA: cross-client items in the Queue, when known. */
  queueCount?: number | null;
  /** XA: the agency workspace, when the person is inside one client. */
  agencyWorkspaceId?: string;
}

export interface XaSidebarProps {
  agencyNavigation?: XaAgencyNavigation;
  connectionsAvailable?: boolean;
  ownerBrand?: OwnerBrand;
  workspaceName?: string;
  active?: StrelvaSection;
  appBase?: string;
  workspaceId?: string;
  accountName: string;
  accountDetail?: string;
  businessContext?: ReactNode;
  contextualNavigation?: ReactNode;
  pinned?: readonly StrelvaPinnedItem[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onNavigate?: (section: NavigableSection) => void;
  onSearch?: () => void;
  onStart?: () => void;
  startDisabled?: boolean;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  standalone?: boolean;
  systemsReleased?: boolean;
  needsYou?: { count: number | null; label?: string };
  allClients?: { href: string; onOpen?: () => void };
  /** XA: the business's agency, shown under "Your agency". */
  agency?: StrelvaAgencyLink;
  /** XA: which details place is open; set by pages outside the workspace view (billing, export). */
  detailsPlace?: StrelvaDetailsPlace;
}

const DETAILS_SECTIONS: ReadonlySet<StrelvaSection | undefined> = new Set(["settings", "access", "connections", "help"]);

function inPlace(event: MouseEvent<HTMLAnchorElement>, action: (() => void) | undefined) {
  if (!action || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  action();
}

function Item({ href, icon: Icon, label, current, count, onOpen, onClose }: { href: string; icon: LucideIcon; label: string; current?: boolean; count?: number | null; onOpen?: () => void; onClose?: () => void }) {
  return <Link className={styles.item} href={href} aria-current={current ? "page" : undefined} aria-label={count ? `${label}, ${count} waiting` : undefined}
    onClick={event => { inPlace(event, onOpen ? () => { onClose?.(); onOpen(); } : undefined); if (!onOpen) onClose?.(); }}>
    <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>{label}</span>{count ? <span className={styles.count} aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}
  </Link>;
}

export function XaSidebar(props: XaSidebarProps) {
  const { agencyNavigation, connectionsAvailable = false, ownerBrand, workspaceName, active, appBase = "", workspaceId, accountName, accountDetail, businessContext, contextualNavigation, pinned = [], mobileOpen = false, onCloseMobile, onNavigate, onSearch, onStart, startDisabled = false, signedIn = true, signInHref, signOut, standalone = false, systemsReleased = false, needsYou, allClients, agency, detailsPlace } = props;
  const contextName = plainWorkspaceName(businessContext);
  const name = workspaceName || contextName || (agencyNavigation && ownerBrand?.agencyId ? ownerBrand.name : "Workspace");
  const href = (section: StrelvaSection) => workspaceSectionHref(section, appBase, workspaceId);
  const go = (section: NavigableSection) => onNavigate ? () => onNavigate(section) : undefined;
  const scoped = (path: string, id = workspaceId) => `${appBase}${path}${id ? `${path.includes("?") ? "&" : "?"}workspaceId=${encodeURIComponent(id)}` : ""}`;
  const place = placeForSection(active);
  const agencySales = agencyNavigation?.leadsCurrent ? "leads" : agencyNavigation?.paymentLinksCurrent ? "payments" : undefined;
  const agencyDetails = Boolean(agencyNavigation) && (Boolean(agencySales) || agencyNavigation?.active === "team" || agencyNavigation?.active === "verification" || Boolean(detailsPlace) || DETAILS_SECTIONS.has(active));
  const ownerDetails = !agencyNavigation && (Boolean(detailsPlace) || DETAILS_SECTIONS.has(active));
  const details = agencyDetails || ownerDetails;
  const currentPin = pinned.find(entry => entry.current)?.id;
  const agencyId = agencyNavigation?.agencyWorkspaceId || workspaceId;
  const agencyHref = (view: AgencyPlace) => agencyNavigation?.hrefs?.[view]
    || (view === "home" ? workspaceSectionHref("home", appBase, agencyId)
      : view === "verification" ? scoped("/workspace/agency/start", agencyId)
        : view === "minutes" ? workspaceSectionHref("ongoing", appBase, agencyId)
          : `${workspaceSectionHref("home", appBase, agencyId)}${agencyId ? "&" : "?"}agencyView=${view}`);
  const agencyGo = (view: AgencyPlace) => view !== "home" && view !== "verification" && view !== "minutes" && agencyNavigation?.onNavigate ? () => agencyNavigation.onNavigate?.(view) : undefined;
  const brandCredit = ownerBrand?.agencyId ? <p className={styles.credit}>{name === ownerBrand.name || name.startsWith(`${ownerBrand.name} / `) ? "Runs on Strelva" : `${ownerBrand.name} · Runs on Strelva`}</p> : ownerBrand?.name === "Agency identity unavailable" ? <p className={styles.credit}>Agency identity unavailable</p> : null;
  const showSwitcher = Boolean(businessContext && !contextName);
  const close = () => onCloseMobile?.();
  // In its own workspace (owner or agency) home swaps in place; inside a client it is a link to the agency.
  const homeInPlace = onNavigate && !agencyNavigation?.agencyWorkspaceId ? () => { close(); onNavigate("home"); } : undefined;

  const header = details
    ? <Link className={styles.back} href={agencyNavigation ? agencyHref("home") : href("home")} onClick={event => { inPlace(event, homeInPlace); if (!homeInPlace) close(); }}><ArrowLeft size={16} aria-hidden="true" /><span>{name}</span></Link>
    : showSwitcher ? <div className={styles.switcher}>{businessContext}</div>
      : <Link href={agencyNavigation ? agencyHref("home") : href("home")} className={styles.brand} aria-label={`${name} home`} onClick={event => inPlace(event, homeInPlace)}>
        {ownerBrand?.agencyId && ownerBrand.logoUrl ? <img src={ownerBrand.logoUrl} alt="" width={22} height={22} className={styles.agencyLogo} /> : <XaMark size={22} />}
        <span className={styles.brandName}>{name}</span>
      </Link>;

  const utilities = <div className={styles.group} aria-label="Workspace utilities">
    {onStart ? <button type="button" className={styles.item} disabled={startDisabled} onClick={() => { close(); onStart(); }}><SquarePen size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>{XA_PLACE_LABELS.newRequest}</span></button>
      : <Link className={styles.item} href={`${appBase}/workspace?view=start${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ""}`} aria-disabled={startDisabled || undefined} tabIndex={startDisabled ? -1 : undefined} onClick={event => { if (startDisabled) event.preventDefault(); close(); }}><SquarePen size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>{XA_PLACE_LABELS.newRequest}</span></Link>}
    {onSearch ? <button type="button" className={styles.item} onClick={() => { close(); onSearch(); }} aria-keyshortcuts="Meta+K Control+K"><Search size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>{XA_PLACE_LABELS.search}</span></button>
      : <Link className={styles.item} href={`${href("work")}&search=1`} onClick={close}><Search size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>{XA_PLACE_LABELS.search}</span></Link>}
    {allClients && !agencyNavigation ? <Link className={styles.item} href={allClients.href} onClick={event => { inPlace(event, allClients.onOpen ? () => { close(); allClients.onOpen?.(); } : undefined); if (!allClients.onOpen) close(); }}><Users size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.itemLabel}>All clients</span></Link> : null}
  </div>;

  const ownerMain = <XaGlideList as="nav" label="Main" className={styles.group}>
    {/* The waiting item is said once in the rail: a dot on its System. Today counts only what no System row carries. */}
    <Item href={href("home")} icon={Sun} label={XA_PLACE_LABELS.today} current={!currentPin && (place === "home" || place === "needs-you")} count={pinned.some(entry => entry.state === "waits") ? null : needsYou?.count ?? null} onOpen={go("home")} onClose={close} />
    <Item href={href("requests")} icon={ListChecks} label={XA_PLACE_LABELS.requests} current={!currentPin && place === "requests"} onOpen={go("requests")} onClose={close} />
    <Item href={href("ongoing")} icon={ScrollText} label={XA_PLACE_LABELS.minutes} current={!currentPin && place === "ongoing"} onOpen={go("ongoing")} onClose={close} />
  </XaGlideList>;

  const agencyMain = agencyNavigation ? <XaGlideList as="nav" label="Main" className={styles.group}>
    {(["home", "queue", "library", "minutes"] as const).map(view => {
      const Icon = view === "home" ? Sun : view === "queue" ? Inbox : view === "library" ? Library : ScrollText;
      const label = view === "home" ? XA_PLACE_LABELS.today : view === "queue" ? XA_PLACE_LABELS.queue : view === "library" ? XA_PLACE_LABELS.library : XA_PLACE_LABELS.minutes;
      const current = !agencyNavigation.clients?.some(client => client.current) && agencyNavigation.active === view;
      return <Item key={view} href={agencyHref(view)} icon={Icon} label={label} current={current} count={view === "queue" ? agencyNavigation.queueCount ?? null : null} onOpen={view === "home" ? homeInPlace : agencyGo(view)} onClose={close} />;
    })}
  </XaGlideList> : null;

  const businessList = <section className={styles.group} aria-label={XA_PLACE_LABELS.yourBusiness}>
    <h2 className={styles.head}>{XA_PLACE_LABELS.yourBusiness}</h2>
    <XaGlideList>
      {pinned.map(entry => <Link key={entry.id} className={styles.system} href={entry.href} title={entry.title} aria-current={currentPin === entry.id ? "page" : undefined} onClick={event => { inPlace(event, entry.onOpen ? () => { close(); entry.onOpen?.(); } : undefined); if (!entry.onOpen) close(); }}>
        <XaSystemTile kind={entry.kind || "website"} size={26} />
        <span className={styles.itemLabel}>{entry.title}</span>
        {entry.state === "waits" ? <span className={styles.aside} data-tone="waits"><span className={styles.dot} data-kind="waits" aria-hidden="true" /><span className={styles.srOnly}>Waits for you</span></span>
          : entry.state === "down" ? <span className={styles.aside} data-tone="down">Not working</span>
            : entry.state === "draft" ? <span className={styles.aside}>Draft</span>
              : entry.detail ? <span className={styles.aside}>{entry.detail}</span> : null}
      </Link>)}
    </XaGlideList>
    <Link className={styles.system} href={href("apps")} aria-current={place === "apps" ? "page" : undefined} onClick={event => { inPlace(event, go("apps") ? () => { close(); onNavigate?.("apps"); } : undefined); if (!onNavigate) close(); }}>
      <XaAddTile size={26} /><span className={styles.itemLabel}>{pinned.length ? XA_PLACE_LABELS.addToBusiness : systemsReleased ? SYSTEMS_LIST_LABEL : PLACE_LABELS.filesAndResults}</span>
    </Link>
  </section>;

  const agencyRow = agency ?? (ownerBrand?.agencyId && !agencyNavigation ? { name: ownerBrand.name } : undefined);
  const yourAgency = agencyRow ? <section className={styles.group} aria-label={XA_PLACE_LABELS.yourAgency}>
    <h2 className={styles.head}>{XA_PLACE_LABELS.yourAgency}</h2>
    {agencyRow.href ? <Link className={styles.system} href={agencyRow.href}><XaInitial name={agencyRow.name} color={agencyRow.color} /><span className={styles.itemLabel}>{agencyRow.name}</span>{agencyRow.person ? <span className={styles.aside}>{agencyRow.person}</span> : null}</Link>
      : <div className={styles.system} data-static><XaInitial name={agencyRow.name} color={agencyRow.color} /><span className={styles.itemLabel}>{agencyRow.name}</span>{agencyRow.person ? <span className={styles.aside}>{agencyRow.person}</span> : null}</div>}
  </section> : null;

  const clients = agencyNavigation ? <section className={styles.group} aria-label={XA_PLACE_LABELS.clients}>
    <div className={styles.headRow}><h2 className={styles.head}>{XA_PLACE_LABELS.clients}</h2>{allClients ? <Link className={styles.headLink} href={allClients.href} onClick={event => { inPlace(event, allClients.onOpen ? () => { close(); allClients.onOpen?.(); } : undefined); if (!allClients.onOpen) close(); }}>All clients</Link>
      : <Link className={styles.headLink} href={agencyHref("clients")} aria-current={agencyNavigation.active === "clients" && !agencyNavigation.clients?.some(client => client.current) ? "page" : undefined} onClick={event => { const open = agencyGo("clients"); inPlace(event, open ? () => { close(); open(); } : undefined); if (!open) close(); }}>All clients</Link>}</div>
    <XaGlideList>
      {(agencyNavigation.clients ?? []).map(client => <Link key={client.id} className={styles.system} href={client.href} aria-current={client.current ? "page" : undefined} aria-label={client.waits ? `${client.name}, needs you` : undefined} onClick={event => { inPlace(event, client.onOpen ? () => { close(); client.onOpen?.(); } : undefined); if (!client.onOpen) close(); }}>
        <XaInitial name={client.name} color={client.color} /><span className={styles.itemLabel}>{client.name}</span>
        {client.waits ? <span className={styles.dot} data-kind="waits" aria-hidden="true" /> : client.detail ? <span className={styles.aside}>{client.detail}</span> : null}
      </Link>)}
    </XaGlideList>
    <Link className={styles.system} href={agencyNavigation.hrefs?.clients && agencyNavigation.active === "clients" ? agencyNavigation.hrefs.clients : scoped("/workspace/agency/clients/new", agencyId)} onClick={close}><XaAddTile size={26} /><span className={styles.itemLabel}>{XA_PLACE_LABELS.addClient}</span></Link>
  </section> : null;

  const ownerDetailItems: readonly { place: StrelvaDetailsPlace; icon: LucideIcon; label: string; href: string; section?: NavigableSection }[] = [
    { place: "record", icon: Building2, label: XA_PLACE_LABELS.businessRecord, href: href("settings"), section: "settings" },
    { place: "access", icon: Users, label: XA_PLACE_LABELS.access, href: href("access"), section: "access" },
    { place: "plan", icon: CreditCard, label: XA_PLACE_LABELS.plan, href: scoped("/workspace/billing") },
    { place: "export", icon: Package, label: XA_PLACE_LABELS.takeItWithYou, href: scoped("/workspace/export") },
    ...(connectionsAvailable ? [{ place: "connections" as const, icon: Plug, label: XA_PLACE_LABELS.connections, href: href("connections"), section: "connections" as const }] : []),
    { place: "help", icon: CircleHelp, label: XA_PLACE_LABELS.help, href: href("help"), section: "help" },
  ];
  const openDetails: StrelvaDetailsPlace | undefined = detailsPlace ?? (active === "settings" ? "record" : active === "access" ? "access" : active === "connections" ? "connections" : active === "help" ? "help" : undefined);
  const detailsNav = ownerDetails ? <XaGlideList as="nav" label={XA_PLACE_LABELS.details} className={styles.group}>
    {ownerDetailItems.map(entry => <Item key={entry.place} href={entry.href} icon={entry.icon} label={entry.label} current={openDetails === entry.place} onOpen={entry.section ? go(entry.section) : undefined} onClose={close} />)}
  </XaGlideList> : agencyDetails && agencyNavigation ? <XaGlideList as="nav" label={XA_PLACE_LABELS.agencyDetails} className={styles.group}>
    <Item href={agencyHref("team")} icon={Users} label={XA_PLACE_LABELS.team} current={!agencySales && !openDetails && agencyNavigation.active === "team"} onOpen={agencyGo("team")} onClose={close} />
    <Item href={agencyHref("verification")} icon={BadgeCheck} label={XA_PLACE_LABELS.verification} current={!agencySales && !openDetails && agencyNavigation.active === "verification"} onClose={close} />
    {agencyNavigation.leadsAvailable && agencyId ? <Item href={scoped("/workspace/leads", agencyId)} icon={Inbox} label={XA_PLACE_LABELS.leads} current={agencySales === "leads"} onClose={close} /> : null}
    {agencyId ? <Item href={scoped("/workspace/payment-links", agencyId)} icon={FileText} label={XA_PLACE_LABELS.paymentLinks} current={agencySales === "payments"} onClose={close} /> : null}
    {connectionsAvailable ? <Item href={href("connections")} icon={Plug} label={XA_PLACE_LABELS.connections} current={!agencySales && openDetails === "connections"} onOpen={go("connections")} onClose={close} /> : null}
    <Item href={href("help")} icon={CircleHelp} label={XA_PLACE_LABELS.help} current={!agencySales && openDetails === "help"} onOpen={go("help")} onClose={close} />
  </XaGlideList> : null;

  const detailsHref = agencyNavigation ? agencyHref("team") : href("settings");
  return <aside className={styles.sidebar} data-open={mobileOpen} data-standalone={standalone} aria-label={`${name} navigation`}>
    <div className={styles.top}>
      {header}
      <button className={styles.close} aria-label="Close navigation" type="button" onClick={close}><X size={20} aria-hidden="true" /></button>
    </div>
    {brandCredit}
    <div className={styles.body}>
      {details ? detailsNav : <>
        {utilities}
        {agencyNavigation ? agencyMain : ownerMain}
        {agencyNavigation ? clients : businessList}
        {agencyNavigation ? null : yourAgency}
        {contextualNavigation ? <div className={styles.contextual}>{contextualNavigation}</div> : null}
      </>}
    </div>
    <div className={styles.footer}>
      {signedIn ? <>
        <Link className={styles.account} href={href("account")} aria-current={place === "account" ? "page" : undefined} onClick={close}>
          <XaInitial name={accountName} shape="round" size={28} />
          <span className={styles.accountText}><strong>{accountName}</strong>{accountDetail ? <small>{accountDetail}</small> : null}</span>
        </Link>
        {details ? null : <Link className={styles.footerIcon} href={detailsHref} aria-label={agencyNavigation ? XA_PLACE_LABELS.agencyDetails : XA_PLACE_LABELS.details} title={agencyNavigation ? XA_PLACE_LABELS.agencyDetails : XA_PLACE_LABELS.details} onClick={event => { inPlace(event, !agencyNavigation && onNavigate ? () => { close(); onNavigate("settings"); } : agencyGo("team") ? () => { close(); agencyNavigation?.onNavigate?.("team"); } : undefined); }}>{agencyNavigation ? <Users size={17} strokeWidth={1.7} aria-hidden="true" /> : <Building2 size={17} strokeWidth={1.7} aria-hidden="true" />}</Link>}
        <span className={styles.signOut}>{signOut === undefined ? <WorkspaceSignOutButton className={styles.signOutButton} /> : signOut}</span>
      </> : <Link className={styles.account} href={signInHref || `${appBase}/sign-in?next=%2Fworkspace`}><UserRound size={18} aria-hidden="true" /><span className={styles.accountText}><strong>Sign in</strong></span></Link>}
    </div>
  </aside>;
}
