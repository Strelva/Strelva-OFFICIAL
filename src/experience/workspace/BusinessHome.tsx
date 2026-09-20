"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  FileText,
  Globe2,
  LayoutGrid,
  Search,
  Settings2,
  Users,
  Workflow,
} from "lucide-react";
import { AtmosphericCard } from "@/components/ui/atmosphere/AtmosphericCard";
import { LogoMark } from "@/components/Logo";
import { StrelvaSidebar, type StrelvaSection } from "@/experience/app-frame/StrelvaSidebar";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { workspaceHome } from "./workspace-home";
import { workspaceWorkLabel } from "./work-label";
import styles from "./business-home.module.css";

type Destination = {
  id: string;
  title: string;
  detail: string;
  kind: string;
  open: () => void;
};

const paths = [
  "M350 226 C176 223 130 87 164 78",
  "M350 226 C526 220 585 79 544 78",
  "M350 226 C176 241 93 247 112 248",
  "M350 226 C522 238 585 258 594 263",
  "M350 226 C208 293 184 384 217 393",
  "M350 226 C476 292 513 375 505 393",
];

export function BusinessHome({
  snapshot,
  sites,
  unassignedSites,
  siteAssignmentsKnown,
  offerings,
  busy,
  notice,
  onOpen,
  onStart,
  onRequest,
  onWork,
  onOngoing,
  onAccess,
  onSettings,
  onHelp,
  onExplore,
  onOfferings,
  appBase = "",
  accountHref,
  signOut,
  managedWorkUnavailable,
  onWebsiteCommand,
  onRetryWebsiteAssignments,
}: {
  appBase?: string;
  accountHref: string;
  onExplore: () => void;
  onOfferings: (id?: string) => void;
  managedWorkUnavailable?: boolean;
  snapshot: WorkspaceSnapshot;
  sites: readonly ManagedWorkSummary[];
  unassignedSites: readonly ManagedWorkSummary[];
  siteAssignmentsKnown: boolean;
  offerings: WorkspaceOfferingState;
  busy: boolean;
  notice?: ReactNode;
  onOpen: (id: string) => void;
  onStart: () => void;
  onRequest?: (request: string) => void;
  onWork: () => void;
  onOngoing: () => void;
  onAccess: () => void;
  onSettings: () => void;
  onHelp: () => void;
  signOut?: ReactNode;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
}) {
  const [request, setRequest] = useState("");
  const [search, setSearch] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const menuRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const attentionRef = useRef<HTMLElement>(null);
  const current = snapshot.workspaces.find((space) => space.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const destinations: Destination[] = [
    ...sites.map((site) => ({
      id: `site-${site.id}`,
      title: site.title,
      detail: "Managed website",
      kind: "website",
      open: () => window.location.assign(site.href),
    })),
    ...home.results.map((work) => ({
      id: work.id,
      title: work.title,
      detail:
        workspaceWorkLabel(work),
      kind: work.productId,
      open: () => onOpen(work.id),
    })),
  ];
  const visible = destinations.filter((item) =>
    `${item.title} ${item.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  const starters: Destination[] = [
    { id: "application", title: "Create an application", detail: "Build something people can use", kind: "applications", open: onStart },
    { id: "document", title: "Create a document", detail: "Make a useful work product", kind: "documents", open: onStart },
    { id: "ongoing", title: "Set up ongoing work", detail: "Create a repeatable check", kind: "operations", open: onStart },
    { id: "people", title: "Invite your team", detail: "Give people the access they need", kind: "people", open: onAccess },
  ];
  const sceneItems = visible.length || destinations.length || readOnly || search ? visible.slice(0, 6) : starters;
  const counts = [
    { label: "Needs attention", value: home.attention.length, kind: "attention" },
    { label: "Saved work", value: snapshot.work.length, kind: "work" },
    { label: "Applications", value: snapshot.work.filter((item) => item.productId === "applications").length, kind: "applications" },
    { label: "Documents", value: snapshot.work.filter((item) => item.productId === "documents").length, kind: "documents" },
  ];

  function icon(kind: string) {
    const Icon = kind === "website"
      ? Globe2
      : kind === "applications"
        ? LayoutGrid
        : kind === "documents"
          ? FileText
          : kind === "operations"
            ? Workflow
            : kind === "people"
              ? Users
              : kind === "attention"
                ? Bell
                : BriefcaseBusiness;
    return <Icon size={18} strokeWidth={1.6} aria-hidden="true" />;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request.trim() || readOnly || busy) return;
    if (onRequest) onRequest(request.trim());
    else onStart();
  }

  function navigate(section: Exclude<StrelvaSection, "account">) {
    if (section === "home") {
      setSearch("");
      setNavigationOpen(false);
      return;
    }
    if (section === "work") onWork();
    if (section === "ongoing") onOngoing();
    if (section === "access") onAccess();
    if (section === "settings") onSettings();
    if (section === "products") onExplore();
    if (section === "help") onHelp();
  }

  const quietMotion = reduceMotion
    ? {}
    : {
        whileHover: { y: -3 },
        whileTap: { y: 0, scale: 0.96 },
      };

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
      <div
        className={styles.root}
        onKeyDown={(event) => {
          if (event.key === "Escape" && navigationOpen) {
            setNavigationOpen(false);
            menuRef.current?.focus();
          }
        }}
      >
        <a className={styles.skip} href="#business-home-main">Skip to your business</a>
        <StrelvaSidebar
          active="home"
          appBase={appBase}
          accountName={snapshot.actor.email.split("@")[0] || "Your account"}
          accountDetail={snapshot.actor.email}
          mobileOpen={navigationOpen}
          onCloseMobile={() => setNavigationOpen(false)}
          onNavigate={navigate}
          onSearch={() => { setNavigationOpen(false); searchRef.current?.focus(); }}
          onStart={onStart}
          signOut={signOut}
          standalone
        />

        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <button ref={menuRef} className={styles.menu} aria-label={navigationOpen ? "Close navigation" : "Open navigation"} aria-expanded={navigationOpen} onClick={() => setNavigationOpen(!navigationOpen)}><LayoutGrid size={20} /></button>
            <label className={styles.search}><Search size={17} aria-hidden="true" /><input ref={searchRef} aria-label="Find your work" placeholder="Search your business and work…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <button className={styles.iconButton} aria-label="See work needing attention" onClick={() => { attentionRef.current?.scrollIntoView({ block: "center" }); attentionRef.current?.focus(); }}><Bell size={19} />{home.attention.length > 0 && <span className={styles.notificationDot} />}</button>
            <a className={styles.avatar} href={accountHref} aria-label={`${snapshot.actor.email.split("@")[0]} ${snapshot.actor.email}`}>{initials}</a>
          </header>
          {notice}
          {managedWorkUnavailable && <p role="status" className={styles.connectionNotice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p>}

          <main id="business-home-main" className={styles.main} aria-busy={busy}>
            <div className={styles.center}>
              <motion.header
                className={styles.greeting}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <div>
                  <span className={styles.welcome}>Welcome back</span>
                  <h1 className="font-display">{readOnly ? "A look inside." : "Your business, at a glance."}</h1>
                  <p>{readOnly ? `Work shared with you by ${name}.` : `Everything happening in ${name}, in one place.`}</p>
                </div>
                <span className={styles.scope}>{readOnly ? "Read-only" : "Your workspace"}</span>
              </motion.header>

              <div className={styles.metrics}>
                {counts.map((count, index) => (
                  <motion.button
                    key={count.label}
                    onClick={count.kind === "attention" ? () => { attentionRef.current?.scrollIntoView({ block: "center" }); attentionRef.current?.focus(); } : onWork}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.26, delay: reduceMotion ? 0 : 0.035 * index, ease: [0.16, 1, 0.3, 1] }}
                    {...quietMotion}
                  >
                    <span className={styles.symbol} data-kind={count.kind}>{icon(count.kind)}</span>
                    <span><strong>{busy ? "…" : count.value}</strong><small>{count.label}</small></span>
                    <ChevronRight className={styles.metricArrow} size={15} />
                  </motion.button>
                ))}
              </div>

              <section className={styles.scene} aria-label="Your business and work">
                <div className={styles.ground} aria-hidden="true" />
                <svg className={styles.paths} viewBox="0 0 700 450" fill="none" aria-hidden="true">
                  {paths.slice(0, busy ? 0 : sceneItems.length).map((path, index) => (
                    <motion.path
                      key={path}
                      d={path}
                      initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: reduceMotion ? 0.2 : 0.72, delay: reduceMotion ? 0 : 0.12 + index * 0.045, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ))}
                </svg>
                <motion.img
                  data-testid="strelva-business-illustration"
                  className={styles.illustration}
                  src="/images/workspace/business-home.png"
                  alt=""
                  width="1254"
                  height="1254"
                  initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
                <div className={styles.businessName}><strong className="font-display">{name}</strong><span>Your business, held together.</span></div>

                {busy ? <p role="status" className={styles.sceneNote}>Loading your work…</p> : (
                  <motion.ul layout={!reduceMotion} className={styles.destinations}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {sceneItems.map((item) => (
                        <motion.li
                          layout={!reduceMotion}
                          key={item.id}
                          initial={reduceMotion ? false : { opacity: 0, transform: "scale(0.96)" }}
                          animate={{ opacity: 1, transform: "scale(1)" }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }}
                          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        >
                          <motion.button onClick={item.open} aria-label={destinations.length ? `Open ${item.title}` : `Start ${item.title}`} {...quietMotion}>
                            <span className={styles.symbol} data-kind={item.kind}>{icon(item.kind)}</span>
                            <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </motion.button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                )}
                {!busy && search && !visible.length && <motion.p role="status" className={styles.sceneNote} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>No work matches “{search}”. <button onClick={() => setSearch("")}>Clear search</button></motion.p>}
                {!busy && !destinations.length && !search && <p className={styles.emptyNote}>{readOnly ? "No saved work has been shared here yet." : "Start with something useful. Your saved work will gather around your business."}</p>}
              </section>

              {!readOnly && (
                <form className={styles.composer} onSubmit={submit}>
                  <span className={styles.spark}><LogoMark className={styles.composerMark} /></span>
                  <label className={styles.srOnly} htmlFor="home-request">What would you like to work on today?</label>
                  <input id="home-request" placeholder="Tell Strelva what your business needs…" value={request} onChange={(event) => setRequest(event.target.value)} disabled={busy} />
                  <button className={styles.suggestion} type="button" onClick={() => setRequest("Build an application for my team")}>Build an app</button>
                  <motion.button className={styles.submit} type="submit" disabled={!request.trim() || busy} aria-label="Continue with this request" whileTap={reduceMotion ? undefined : { transform: "scale(0.96)" }} transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}><ArrowRight size={19} /></motion.button>
                </form>
              )}
            </div>

            <div className={styles.right}>
              <AtmosphericCard ref={attentionRef} tabIndex={-1} theme="dark" className={styles.attentionCard} contentClassName={`${styles.panel} ${styles.atmosphereContent}`} aria-labelledby="home-attention">
                <header><span className={styles.symbol} data-kind="attention"><Bell size={17} /></span><h2 id="home-attention">Needs your attention</h2><span className={styles.count}>{busy ? "…" : home.attention.length}</span></header>
                {busy ? <p role="status">Checking your work…</p> : home.attention.length ? (
                  <ul>{home.attention.map(({ work, reason }) => <li key={work.id}><motion.button onClick={() => onOpen(work.id)} {...quietMotion}><span className={styles.symbol} data-kind="attention">{icon(work.productId)}</span><span><strong>{work.title}</strong><small>{reason}</small></span><ChevronRight size={16} /></motion.button></li>)}</ul>
                ) : <div className={styles.quiet}><Settings2 size={23} /><strong>All caught up.</strong><p>Work that needs a decision will appear here.</p></div>}
              </AtmosphericCard>

              <section className={styles.panel} aria-labelledby="home-recent">
                <header><h2 id="home-recent">Recent work</h2><button className={styles.viewAll} onClick={onWork}>View all <ArrowRight size={13} /></button></header>
                {busy ? <p role="status">Loading saved work…</p> : snapshot.work.length ? (
                  <ul>{snapshot.work.slice(0, 5).map((work) => <li key={work.id}><motion.button onClick={() => onOpen(work.id)} {...quietMotion}><span className={styles.symbol} data-kind={work.productId}>{icon(work.productId)}</span><span><strong>{work.title}</strong><small>{work.unavailableReason || (work.operation?.status === "needs_attention" ? "Needs attention" : workspaceWorkLabel(work))}</small></span></motion.button></li>)}</ul>
                ) : <div className={styles.quiet}><FileText size={23} /><strong>Your work starts here.</strong><p>Applications, documents, and other results stay in this workspace.</p>{!readOnly && <button className={styles.begin} onClick={onStart}>Start something new <ArrowRight size={15} /></button>}</div>}
              </section>

              <BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} />
              <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled={current?.kind === "customer" && !readOnly} />

              {unassignedSites.length ? <section className={styles.panel} aria-labelledby="home-unassigned-sites">
                <header><span className={styles.symbol} data-kind="website"><Globe2 size={17} /></span><h2 id="home-unassigned-sites">Authorized sites</h2><span className={styles.count}>{unassignedSites.length}</span></header>
                <p className={styles.panelNote}>{current?.kind !== "customer" ? "Websites you can access through your account. Business assignment is managed in a customer business workspace." : siteAssignmentsKnown ? "Available to your account, but not assigned to this business." : "Available to your account. Business assignment cannot be read from this view."}</p>
                {current?.kind !== "customer" ? <ul>{unassignedSites.slice(0, 5).map((site) => <li key={site.id}><a href={site.href}><strong>{site.title}</strong><small>Account-authorized website</small></a></li>)}</ul> : <WebsiteAssignmentHandoff
                  businessName={name}
                  state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings}
                  sites={unassignedSites.slice(0, 5)}
                  onRetry={onRetryWebsiteAssignments}
                  onCommand={onWebsiteCommand}
                />}
              </section> : null}

              <div className={styles.brandCard} aria-hidden="true"><LogoMark className={styles.brandCardMark} /><p className="font-display">A calmer way to build what comes next.</p></div>
              <p className={styles.footer}>Ideas. People. Progress.<br />Held in one place.</p>
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
