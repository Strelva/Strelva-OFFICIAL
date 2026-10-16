"use client";
/**
 * XA · A3, day one for an agency. One thing to do (add the first client), the
 * sentence under it says what happens when they do (Strelva reads their
 * website), then plain sentences for what comes after. No mark and no idle
 * Pebble: nothing is being done yet. Used by the agency setup page and by the
 * agency's Home while it has no clients. Presentation only: every link it offers leads to a
 * route that rechecks the session and the agency role.
 */
import { useState, type ReactNode } from "react";
import { XaButtonLink, XaComposer, XaHeadline, XaLede, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./agency-door.module.css";

export interface AgencyDayOneProps {
  agencyName: string;
  /** The signed-in person's first name, from their own auth profile. Without it the page greets the agency. */
  viewerFirstName?: string | null;
  /** Clients that chose this agency so far. Day one is zero; the page also serves later visits to setup. */
  clients: number;
  /** Null when this person cannot add clients; `addClientBlocked` says why in one sentence. */
  addClientHref: string | null;
  addClientBlocked?: string;
  /** Import clients the agency already has (Import clients release). */
  importHref?: string | null;
  openAgencyHref: string;
  /** Counts when the caller read them (setup); without them the sentence names the step only. */
  verification: { verified?: number; total?: number; href?: string; onOpen?: () => void; open?: boolean };
  team: { members?: number; pending?: number | null; inviteHref: string | null; ownerOnly?: string };
  brandHref?: string | null;
  /** Ask Strelva from here. Omit where this page cannot carry a request; the composer is then not drawn. */
  onAsk?: (text: string) => void;
  /** What opens in place under the sentences (verification). */
  children?: ReactNode;
}

/** Morning, afternoon or evening on this device's clock. */
export function greetingFor(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function AgencyDayOne({ agencyName, viewerFirstName, clients, addClientHref, addClientBlocked, importHref, openAgencyHref, verification, team, brandHref, onAsk, children }: AgencyDayOneProps) {
  const [ask, setAsk] = useState("");
  // The clock is read once on the client so server and first paint agree on the greeting.
  const [hour] = useState(() => new Date().getHours());
  const first = clients === 0;
  const counted = verification.total !== undefined && verification.verified !== undefined;
  const verifiedAll = counted && verification.total! > 0 && verification.verified === verification.total;
  return <div className={styles.dayOne}>
    <div className={styles.dayLead}>
      <div className={styles.greeting}>
        <XaHeadline size="lg">{viewerFirstName ? `${greetingFor(hour)}, ${viewerFirstName}.` : first ? `${agencyName} is ready.` : `${agencyName} has ${clients} ${clients === 1 ? "client" : "clients"}.`}</XaHeadline>
        <XaLede>{first
          ? `${viewerFirstName ? `${agencyName} is ready. ` : ""}Add a client and their business shows up here, owned by them.`
          : `${viewerFirstName ? `${agencyName} has ${clients} ${clients === 1 ? "client" : "clients"}. ` : ""}Each one owns their business. You work inside the access they give you.`}</XaLede>
      </div>
      <div className={styles.dayActions}>
        {first && addClientHref ? <XaButtonLink variant="primary" size="lg" href={addClientHref}>Add your first client</XaButtonLink>
          : first ? null : <XaButtonLink variant="primary" size="lg" href={openAgencyHref}>Open {agencyName}</XaButtonLink>}
        {first && addClientHref && importHref ? <XaTextLink href={importHref}>or import the clients you have</XaTextLink> : null}
        {first && !addClientHref && addClientBlocked ? <p className={styles.sentence}>{addClientBlocked}</p> : null}
        {first && addClientHref ? <p className={`${styles.sentence} ${styles.dayPromise}`}>Strelva reads their website as soon as you add them, and the owner confirms what it found.</p> : null}
        {!first && addClientHref ? <XaTextLink href={addClientHref}>Add a client</XaTextLink> : null}
      </div>
      <ul className={styles.after} aria-label="After this">
        <li>{verifiedAll ? <>{agencyName} is verified for client work.</> : <>Before you publish to a client’s domain, {verification.href || verification.onOpen
          ? <XaTextLink href={verification.href} onClick={verification.onOpen} aria-label={verification.open ? "Hide verification" : undefined}>get verified for client work</XaTextLink> : "get verified for client work"}.{counted ? verification.verified ? ` ${verification.verified} of ${verification.total} checks done.` : " Nothing is verified yet." : ""}</>}</li>
        <li>{team.members === undefined ? `People who work on clients with you join ${agencyName}. ` : team.members > 1 || team.pending ? <>{team.members} {team.members === 1 ? "person" : "people"} at {agencyName}{team.pending ? `, ${team.pending} invited` : ""}. </> : "Just you so far. "}
          {team.inviteHref ? <XaTextLink href={team.inviteHref}>Invite a teammate</XaTextLink> : team.ownerOnly ?? null}</li>
        {brandHref ? <li>Clients see {agencyName} on every change you prepare. <XaTextLink href={brandHref}>Edit how it looks</XaTextLink></li> : null}
      </ul>
      {children}
      {onAsk ? <XaComposer value={ask} onChange={setAsk} onSubmit={() => { onAsk(ask); setAsk(""); }} placeholder="Ask Strelva for anything" /> : null}
    </div>
  </div>;
}
