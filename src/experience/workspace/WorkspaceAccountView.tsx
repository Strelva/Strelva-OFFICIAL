import type { ReactNode } from "react";
import { XaHeadline, XaInitial, XaLabel, XaPebbleAvatar, XaStatus, XaSystemTile } from "@/components/ui/strelva/Xa";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { Workspace } from "@/platform/workspaces";
import { WorkspaceSignOutButton } from "./WorkspaceSignOutButton";
import styles from "./workspace-account.module.css";

type AccountWorkspace = Pick<Workspace, "id" | "kind" | "name" | "access">;

/** A website on the older managed model, named by its domain. */
export interface AccountSite { id: string; domain: string; href: string }

export interface WorkspaceAccountViewProps {
  appBase?: string;
  signOut?: ReactNode;
  /** Where the managed websites chooser opens when the sites themselves couldn't be read. */
  managedHref?: string;
  /** The person's websites from before workspaces, by domain. Undefined: not read (show the chooser link). Empty: none. */
  sites?: readonly AccountSite[];
  notice?: ReactNode;
  continuation?: ReactNode;
  payerInbox?: ReactNode;
  name: string | null;
  email: string;
  emailConfirmed: boolean;
  releaseOpen: boolean;
  workspaces: AccountWorkspace[];
  workspacesUnavailable?: boolean;
  mode?: "light" | "dark";
}

/**
 * What a place is to this person, in GLOSSARY words. A business reached
 * through an agency seat is that agency's Client; read-only is the one
 * access worth naming. "Your business" is only for the business's own people.
 */
export function workspaceRole(workspace: Pick<Workspace, "kind" | "access">): string {
  if (workspace.kind === "agency") return "Your agency";
  if (workspace.kind === "customer") {
    if (workspace.access === "delegated_read") return "Client · Read-only access";
    if (workspace.access === "provider_seat") return "Client";
    return "Your business";
  }
  return "Just you";
}

/** The place the account page goes back to: the person's own business first, then their agency, then their own work. */
export function accountHomeWorkspace(workspaces: readonly AccountWorkspace[]): AccountWorkspace | undefined {
  return workspaces.find(item => item.kind === "customer" && item.access === "member")
    ?? workspaces.find(item => item.kind === "agency" && item.access === "member")
    ?? workspaces.find(item => item.kind === "personal")
    ?? workspaces[0];
}

/**
 * XA account (October 16). Inside the R1 details shell: Back to the
 * workspace, then that business's details, with the account itself current
 * in the sidebar foot. The person is the dominant element (their name, large);
 * places they work are open rows that each say "Open"; the place the sidebar
 * goes back to leads the list. Initials are neutral outlines, never filled
 * tiles (tiles are for Systems). Pebble speaks once at the foot.
 *
 * Presentation only. The account route resolves verified identity and access.
 * Hook-free on purpose: the route and its tests call it as a function.
 */
export function WorkspaceAccountView({ appBase, signOut, managedHref = "/account?managed=1", sites, notice, continuation, payerInbox, name, email, emailConfirmed, releaseOpen, workspaces, workspacesUnavailable = false, mode }: WorkspaceAccountViewProps) {
  const base = appBase || "";
  const placesNote = !releaseOpen ? "Strelva opens soon. Your sign-in is unchanged."
    : workspacesUnavailable ? "Strelva couldn’t read where you work just now. No access or billing changed."
      : !emailConfirmed ? "Your businesses appear after your email is confirmed."
        : !workspaces.length ? "No business or agency has invited this email yet. When one does, it appears here." : null;
  const places = placesNote ? [] : workspaces;
  const home = accountHomeWorkspace(places);
  const others = places.filter(item => item.id !== home?.id);
  const openHref = (workspace: AccountWorkspace) => `${base}/workspace?workspaceId=${encodeURIComponent(workspace.id)}`;
  const person = name || email || "Your account";
  const inBusiness = home && (home.kind === "customer" || home.kind === "agency");
  const signOutControl = signOut === null ? null : signOut ?? <WorkspaceSignOutButton className={styles.textButton} />;

  return <StrelvaShell appBase={base} mode={mode} title="Account" active="account" signOut={null}
    workspaceId={inBusiness ? home.id : undefined} workspaceName={inBusiness ? home.name : undefined}
    agencyNavigation={home?.kind === "agency" ? { agencyWorkspaceId: home.id, leadsAvailable: false } : undefined}
    unopened={!inBusiness} accountName={person} accountDetail={name ? email : undefined} notice={notice}>
    <div className={styles.page}>
      {!inBusiness ? <a className={styles.back} href={`${base}/workspace`}>Back to Home</a> : null}

      <section className={styles.identity} aria-label="You">
        <XaInitial name={person} shape="round" size={56} />
        <div className={styles.identityText}>
          <XaHeadline size="lg" quiet={name ? email || "No email on this sign-in" : "No name on this sign-in"}>{person}</XaHeadline>
          <p className={styles.facts}>
            {emailConfirmed ? <span>You sign in with a link sent to this email. There’s no password.</span> : <XaStatus kind="waits" size="sm">Confirmation needed</XaStatus>}
            {signOutControl ? <span className={styles.signOut}>{signOutControl}</span> : null}
          </p>
          {!emailConfirmed ? <p className={styles.body}>Confirm this email from the link Strelva sent, then come back. Your businesses stay hidden until then.</p> : null}
        </div>
      </section>

      {continuation}

      <section className={styles.section} aria-labelledby="account-places">
        <XaLabel as="h2" id="account-places">Where you work</XaLabel>
        {placesNote ? <p className={styles.body}>{placesNote}</p> : <ul className={styles.places} aria-label="Where you work">
          {[home, ...others].filter((item): item is AccountWorkspace => Boolean(item)).map(workspace => <li key={workspace.id}>
            <a className={styles.place} data-lead={workspace.id === home?.id || undefined} href={openHref(workspace)}>
              <span className={styles.mark} data-shape={workspace.kind === "personal" ? "round" : undefined} aria-hidden="true">{workspace.name.trim().charAt(0).toUpperCase() || "·"}</span>
              <span className={styles.placeText}><span className={styles.placeName}>{workspace.name}</span><span className={styles.placeRole}>{workspaceRole(workspace)}</span></span>
              <span className={styles.open}>Open<span className={styles.srOnly}> {workspace.name}</span></span>
            </a>
          </li>)}
        </ul>}
      </section>

      {releaseOpen && emailConfirmed && payerInbox ? <section className={styles.section} aria-labelledby="account-payer">
        <XaLabel as="h2" id="account-payer">Asked to pay</XaLabel>
        <p className={styles.body}>A business can ask you to pay for it. Saying yes doesn’t give you access to that business or its work.</p>
        {payerInbox}
      </section> : null}

      {sites === undefined || sites.length ? <section className={styles.section} aria-labelledby="account-sites">
        <XaLabel as="h2" id="account-sites">Your other websites</XaLabel>
        <ul className={styles.places} aria-label="Your other websites">
          {sites === undefined
            ? <li><a className={styles.place} href={managedHref}><XaSystemTile kind="website" size={32} /><span className={styles.placeText}><span className={styles.placeName}>Your other websites</span><span className={styles.placeRole}>Each keeps its own people, settings and billing.</span></span><span className={styles.open}>Open</span></a></li>
            : sites.map(site => <li key={site.id}><a className={styles.place} href={site.href}><XaSystemTile kind="website" size={32} /><span className={styles.placeText}><span className={styles.placeName}>{site.domain}</span><span className={styles.placeRole}>Its billing stays under your existing service agreement.</span></span><span className={styles.open}>Open<span className={styles.srOnly}> {site.domain}</span></span></a></li>)}
        </ul>
      </section> : null}

      <div className={styles.pebble}><XaPebbleAvatar size={32} /><p>Your account is yours. If you stop working with a business, your sign-in stays.</p></div>
    </div>
  </StrelvaShell>;
}
