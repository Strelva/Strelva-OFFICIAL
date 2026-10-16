"use client";
/**
 * The in-between pages (XS · shell states, October 16, 2026): a page that
 * is not there, a page that broke, a door that is not open yet, and the
 * moment a workspace is opening. No Pen render exists for these; they are
 * drawn in the XA language from B1/C1's entry frame (paper column, felt
 * with Pebble doing the page's job) and O1's calm empty.
 *
 * One headline that says what happened, a quieter line that says what it
 * means, one ink pill, text links for everything else. Pebble is in frame
 * for bad news (pose "fixing"). No ids, digests or paths are shown.
 */
import type { ReactNode } from "react";
import { XaButton, XaButtonLink, XaEmpty, XaHeadline, XaPebbleAvatar, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryStack } from "@/components/ui/strelva/xa/entry";
import styles from "./states.module.css";

type Mode = "light" | "dark" | undefined;

function Links({ children }: { children: readonly ReactNode[] }) {
  return <p className={styles.links}>{children.map((child, index) => <span key={index}>{index ? <span aria-hidden="true" className={styles.dot}>·</span> : null}{child}</span>)}</p>;
}

/** A link that is not there. Anyone can land here, signed in or not. */
export function XaNotFound({ mode, homeHref = "/", workspaceHref = "/workspace" }: { mode?: Mode; homeHref?: string; workspaceHref?: string }) {
  return <XaEntryFrame mode={mode} label="Page not found" phoneArt="website"
    felt={<XaEntryFelt pose="website" title="Looking for a business’s website?">Each business’s site lives at its own address. Use the one the business gave you.</XaEntryFelt>}
    footnote="Strelva runs websites and Systems for small businesses and their agencies.">
    <XaEntryStack>
      <XaHeadline size="lg" quiet="The link may be old or mistyped.">This page isn’t here.</XaHeadline>
      <div className={styles.actions}><XaButtonLink variant="primary" size="lg" href={homeHref}>Go to Strelva</XaButtonLink></div>
      <Links>{[<XaTextLink key="w" href={workspaceHref}>Open your workspace</XaTextLink>, <XaTextLink key="s" href="/sign-in">Sign in</XaTextLink>]}</Links>
    </XaEntryStack>
  </XaEntryFrame>;
}

/**
 * A page broke while showing. The error is already reported (the caller
 * captures it); the person gets one way forward and one way out.
 */
export function XaPageBroke({ mode, onRetry, homeHref = "/", homeLabel = "Go to Strelva", where = "this page" }: { mode?: Mode; onRetry: () => void; homeHref?: string; homeLabel?: string; where?: string }) {
  return <XaEntryFrame mode={mode} label="Something went wrong" phoneArt="fixing"
    felt={<XaEntryFelt pose="fixing" title="Strelva has the details.">The error was reported when it happened, so nobody needs you to describe it.</XaEntryFelt>}>
    <XaEntryStack>
      <XaHeadline size="lg" quiet="Nothing was sent or changed.">{`Strelva couldn’t show ${where}.`}</XaHeadline>
      <div className={styles.actions}><XaButton variant="primary" size="lg" onClick={onRetry}>Try again</XaButton></div>
      <Links>{[<XaTextLink key="h" href={homeHref}>{homeLabel}</XaTextLink>, <XaTextLink key="help" href="/workspace?view=help">Get help</XaTextLink>]}</Links>
    </XaEntryStack>
  </XaEntryFrame>;
}

/** The workspace release is off in this environment: say what still works, and where it is. */
export function XaNotOpenYet({ mode, place = "workspace" }: { mode?: Mode; place?: "workspace" | "getting-started" }) {
  const gettingStarted = place === "getting-started";
  return <XaEntryFrame mode={mode} label="Workspaces are not open yet" phoneArt="resting"
    felt={<XaEntryFelt pose="resting" title="Your website keeps running as it is.">Bookings, inquiries and your site work the way they did yesterday.</XaEntryFelt>}>
    <XaEntryStack>
      <XaHeadline size="lg" quiet={gettingStarted ? "Getting started opens with them, once their release checks pass." : "Existing client services are unchanged."}>Workspaces aren’t open yet.</XaHeadline>
      <XaEntryNote>{gettingStarted ? "Nothing you started is lost. Come back to this link when workspaces open." : "Workspaces and agency handoffs open after their release checks are complete."}</XaEntryNote>
      <div className={styles.actions}><XaButtonLink variant="primary" size="lg" href="/account">Open your existing account</XaButtonLink></div>
    </XaEntryStack>
  </XaEntryFrame>;
}

/** Opening a workspace: Pebble is fetching it. Used before the shell can know whose workspace it is. */
export function XaWorkspaceOpening({ label = "Opening your workspace" }: { label?: string }) {
  return <div className={styles.opening}>
    <XaPebbleAvatar size={40} />
    <XaWorking title={label} steps={[]} />
  </div>;
}

/**
 * The workspace could not open (WorkspaceApp, before any snapshot): signed
 * out, not allowed, gone, or a failed read. Inside the real shell, so the
 * page is where the workspace will be once it opens.
 */
export function XaWorkspaceUnopened(props: { reason: "sign-in" | "forbidden" | "gone" | "failed"; message?: string; signInHref: string; accountHref: string; onRetry: () => void }) {
  return <div className={styles.page}><Unopened {...props} /></div>;
}

function Unopened({ reason, message, signInHref, accountHref, onRetry }: { reason: "sign-in" | "forbidden" | "gone" | "failed"; message?: string; signInHref: string; accountHref: string; onRetry: () => void }) {
  // The server's own words for the refusal stay visible: it may say more than the title can.
  const said = message ? <span role="alert">{message}</span> : null;
  if (reason === "sign-in") return <XaEmpty pose="waving" title="Sign in to open your workspace." job="Your place is kept for after you sign in."
    action={<XaButtonLink variant="primary" href={signInHref}>Sign in</XaButtonLink>}>{said}</XaEmpty>;
  if (reason === "forbidden") return <XaEmpty pose="alone" title="This account can’t open this workspace." job="Nothing in it was shown or changed."
    action={<XaButtonLink variant="primary" href={accountHref}>Choose another workspace</XaButtonLink>}>
    {said}{said ? " " : null}Ask its owner to invite the email you sign in with, or open one you already belong to.
  </XaEmpty>;
  if (reason === "gone") return <XaEmpty pose="alone" title="This workspace isn’t available anymore." job="Nothing in it was shown or changed."
    action={<XaButtonLink variant="primary" href={accountHref}>Choose another workspace</XaButtonLink>}>
    {said}{said ? " " : null}The link may be out of date. Ask its owner for a current one.
  </XaEmpty>;
  return <XaEmpty pose="fixing" title="Your workspace didn’t open." job="Nothing in it changed. Trying again reads it fresh."
    action={<XaButton variant="primary" onClick={onRetry}>Try again</XaButton>} secondary={<XaTextLink href={accountHref}>Check your account</XaTextLink>}>{said}</XaEmpty>;
}

/** An agency person in a client shared read-only, with nothing shared yet. */
export function XaSharedReadOnlyEmpty({ business }: { business?: string }) {
  return <div className={styles.page}><XaEmpty pose="resting" title={`${business || "This client"} shared this with you to read.`} job="New work shows here when the client adds it.">
    Only the client can make or change work here.
  </XaEmpty></div>;
}
