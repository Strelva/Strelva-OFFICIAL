"use client";
/**
 * XS · shell states preview: the real account view, ⌘K search, scope
 * switcher, confirm sheet, help, and the in-between pages, inside the real
 * StrelvaShell where they live. Fixtures answer every read locally; nothing
 * here reaches a business. /preview/strelva/xa/xs-shell-states/<screen>?state=…&mode=dark
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaHeadline, XaLede } from "@/components/ui/strelva/Xa";
import { WorkspaceAccountView } from "../WorkspaceAccountView";
import { WorkspaceBusinessSwitcher, agencyClientLinks } from "../WorkspaceBusinessSwitcher";
import { WorkspaceHelp } from "../WorkspaceHelp";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { PublicResultSaveOverlay } from "../WorkspaceApp";
import { StartBusinessFromCheck } from "@/experience/getting-started/StartBusinessFromCheck";
import { XaNotFound, XaNotOpenYet, XaPageBroke, XaSharedReadOnlyEmpty, XaWorkspaceOpening, XaWorkspaceUnopened } from "@/experience/states/XaStates";
import { ACCOUNT_SITES, CLIENTS, HARBOR, NORTH, SEARCH_ITEMS, XS_BASE, accountWorkspaces, agencySnapshot, helpTransport, ownerSnapshot, type XsScreen, type XsState } from "./xs-shell-states-fixture";
import styles from "./xa-foundation-preview.module.css";
import { xaOwnerPinned } from "./xa-day";

type Mode = "light" | "dark";

/** The home behind a popover: whoever is signed in, and the business in focus. */
function Behind({ who, empty = false }: { who: "owner" | "agency"; empty?: boolean }) {
  if (who === "agency") return <div className={styles.center}><div className={styles.error}>
    <XaHeadline size="md" quiet={`You’re in ${HARBOR.name} for North Studio.`}>Good morning, Maya.</XaHeadline>
    <XaLede>{HARBOR.name}’s bookings, website and Google listing are running as they should.</XaLede>
  </div></div>;
  if (empty) return <div className={styles.center}><div className={styles.error}>
    <XaHeadline size="md" quiet={`${HARBOR.name} has nothing in Strelva yet.`}>Good morning, Dr. Lin.</XaHeadline>
    <XaLede>Start with your website or bookings, and it shows up here.</XaLede>
  </div></div>;
  return <div className={styles.center}><div className={styles.error}>
    <XaHeadline size="md" quiet="31 visits booked this week.">Good morning, Dr. Lin.</XaHeadline>
    <XaLede>Bookings, the website and the Google listing are running as they should.</XaLede>
  </div></div>;
}

/** Opens a control the person would open, so a still screenshot shows it. Preview only. */
function useOpen(selector: string | null, before?: () => void) {
  useEffect(() => {
    if (!selector) return;
    before?.();
    const timer = window.setTimeout(() => {
      if (selector === "search") document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
      else {
        // On a phone the switcher lives in the navigation sheet: open that first.
        if (window.innerWidth < 768) document.querySelector<HTMLElement>('[aria-label="Open navigation"]')?.click();
        window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.click(), 300);
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);
}

export function XsShellStatesPreview({ screen, state, mode }: { screen: XsScreen; state: XsState; mode: Mode }) {
  const agency = state === "agency";
  const snapshot = useMemo(() => agency ? agencySnapshot() : ownerSnapshot(), [agency]);
  const [workspaceId, setWorkspaceId] = useState(snapshot.workspaceId);
  const live = { ...snapshot, workspaceId };
  const transport = useMemo(() => helpTransport(state), [state]);
  const storageKey = `strelva:search-query:v1:${encodeURIComponent(HARBOR.email)}:${HARBOR.id}`;
  useOpen(screen === "search" ? "search" : screen === "switcher" ? '[aria-controls="owner-business-menu"]' : null, () => {
    if (screen !== "search") return;
    try { window.sessionStorage.setItem(storageKey, state === "query" ? "book" : state === "none" ? "invoices" : ""); } catch { /* Preview stays usable without storage. */ }
  });
  const notice = <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p>;

  if (screen === "account") return <WorkspaceAccountView mode={mode} appBase="/preview/strelva" managedHref="/preview/strelva/website" signOut={null}
    sites={state === "error" ? undefined : agency || state === "empty" ? [] : ACCOUNT_SITES}
    name={agency ? NORTH.person : HARBOR.owner} email={agency ? NORTH.email : HARBOR.email}
    emailConfirmed={state !== "unconfirmed"} releaseOpen={state !== "closed"} workspacesUnavailable={state === "error"}
    workspaces={state === "empty" ? [] : accountWorkspaces(agency ? "agency" : "owner")}
    payerInbox={state === "waiting" ? <p style={{ margin: 0, fontSize: 15 }}>{HARBOR.name} asked you to pay for its plan. <a href={XS_BASE + "/account?state=waiting"} style={{ color: "var(--st-accent)", fontWeight: 500, textDecoration: "none" }}>Review it</a></p> : undefined} />;
  if (screen === "not-found") return <XaNotFound mode={mode} homeHref="/preview/strelva" workspaceHref={`${XS_BASE}/loading`} />;
  if (screen === "error") return <XaPageBroke mode={mode} onRetry={() => window.location.reload()} homeHref="/preview/strelva" />;
  if (screen === "marketing-error") return <XaPageBroke mode={mode} onRetry={() => window.location.reload()} homeHref="/preview/strelva" />;
  if (screen === "not-open") return <XaNotOpenYet mode={mode} />;
  if (screen === "getting-started-off") return <XaNotOpenYet mode={mode} place="getting-started" />;
  if (screen === "loading") return <StrelvaShell unopened signOut={null} mode={mode} title="Your Strelva"><XaWorkspaceOpening /></StrelvaShell>;

  const switcher = <WorkspaceBusinessSwitcher snapshot={live} busy={state === "busy"} onWorkspace={setWorkspaceId} onNavigate={() => undefined} />;
  const current = live.workspaces.find(item => item.id === workspaceId);
  const shell = (title: string, children: ReactNode, extra: Partial<Parameters<typeof StrelvaShell>[0]> = {}) => <StrelvaShell
    appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceId={HARBOR.id}
    accountName={agency ? NORTH.person : HARBOR.owner} accountDetail={agency ? NORTH.email : HARBOR.email}
    businessContext={switcher} searchItems={state === "empty" ? [] : SEARCH_ITEMS} searchScopeName={current?.name || HARBOR.name}
    pinned={agency || state === "empty" ? [] : xaOwnerPinned({ overrides: { bookings: { state: "waits" } } })}
    agency={agency ? undefined : { name: NORTH.name, person: "Maya", color: "#2f5236" }}
    agencyNavigation={agency ? { active: "home", clients: agencyClientLinks(live, "/preview/strelva", setWorkspaceId).map((client, index) => ({ ...client, detail: `${CLIENTS[index]?.minutes ?? 0} min`, waits: index === 1 })), queueCount: 3, agencyWorkspaceId: NORTH.id } : undefined}
    needsYou={{ count: agency || state === "empty" ? null : 1 }} notice={notice} title={title} {...extra}>{children}</StrelvaShell>;

  if (screen === "unopened") return <StrelvaShell unopened signedIn={state !== "sign-in"} signInHref="/sign-in" title="Your Strelva" mode={mode} accountName={HARBOR.owner} signOut={null} notice={notice}>
    <XaWorkspaceUnopened reason={state === "sign-in" ? "sign-in" : state === "forbidden" ? "forbidden" : state === "gone" ? "gone" : "failed"} message={state === "forbidden" ? "This link was sent to frontdesk@harbordental.com." : undefined} signInHref="/sign-in" accountHref={`${XS_BASE}/account`} onRetry={() => window.location.reload()} />
  </StrelvaShell>;
  if (screen === "shared-empty") return shell(HARBOR.name, <XaSharedReadOnlyEmpty business={HARBOR.name} />);
  if (screen === "search" || screen === "switcher") return shell("Today", <Behind who={agency ? "agency" : "owner"} empty={state === "empty"} />);

  if (screen === "dialog") return <WorkspaceRequestContext.Provider value={async () => state === "loading" ? new Promise<Response>(() => undefined) : state === "error" ? Response.json({ error: "This check couldn’t be opened. It may have expired." }, { status: 404 }) : Response.json({ check: { name: null, suggestedName: HARBOR.name, website: "harbordental.com", kind: "website_audit" } })}>
    {shell("Today", <><Behind who="owner" />{state === "start" || state === "loading" || state === "error"
      ? <StartBusinessFromCheck resultId="fictional-check" workspaceName="Amy’s own work" savingHere={false} saveHereError="" onSaveHere={() => undefined} onClose={() => window.history.back()} />
      : <PublicResultSaveOverlay workspaceName={HARBOR.name} saving={state === "busy"} error={state === "waiting" ? "That result couldn’t be saved. Nothing was copied; try again." : ""} onSave={() => undefined} onClose={() => window.history.back()} />}</>)}
  </WorkspaceRequestContext.Provider>;

  // help
  return <WorkspaceRequestContext.Provider value={transport}>
    {shell("Help", <WorkspaceHelp key={state} workspaceId={state === "no-business" ? undefined : HARBOR.id} workspaceName={HARBOR.name} canManageAgencies
      initialRequest={state === "done" ? "Add a Saturday 9 to 1 slot to Bookings." : ""}
      agencyOptions={state === "no-agency" || state === "loading" ? undefined : [{ label: NORTH.name, agency: { kind: "agency", agencyWorkspaceId: NORTH.id } }]} />, { active: "help" })}
  </WorkspaceRequestContext.Provider>;
}
