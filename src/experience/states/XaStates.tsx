"use client";
/**
 * The in-between pages (XS · shell states, October 16, 2026): a page that
 * is not there, a page that broke, a door that is not open yet, and the
 * moment a workspace is opening. No Pen render exists for these; they are
 * drawn in the XA language from B1/C1's entry column and R1's Pebble line.
 *
 * One headline that says what happened, a quieter line that says what it
 * means, one ink pill. Pebble stands on the page ground below the words,
 * doing the job the page is about (no felt slab, no glow, no caption block).
 * No ids, digests or paths from the system are shown.
 */
import { useEffect, useState, type ReactNode } from "react";
import { XaButton, XaButtonLink, XaHeadline, XaPebbleAvatar, XaTextLink, XaWorking, type XaPose } from "@/components/ui/strelva/Xa";
import { XaEntryFrame, XaEntryStack } from "@/components/ui/strelva/xa/entry";
import styles from "./states.module.css";

type Mode = "light" | "dark" | undefined;

function Links({ children }: { children: readonly ReactNode[] }) {
  return <p className={styles.links}>{children.map((child, index) => <span key={index}>{index ? <span aria-hidden="true" className={styles.dot}>·</span> : null}{child}</span>)}</p>;
}

/** Pebble on the page ground, doing the page's job. `object` is what Pebble is working on; `children` is one sentence with at most one link. */
function Ground({ pose, object, children }: { pose: XaPose; object?: ReactNode; children?: ReactNode }) {
  return <div className={styles.ground} data-object={object ? true : undefined}>
    <span className={styles.groundArt} aria-hidden="true"><img src={`/xa/pose-${pose}.webp`} alt="" draggable={false} decoding="async" /></span>
    {object}
    {children ? <p className={styles.groundLine}>{children}</p> : null}
  </div>;
}

/** The address the person asked for, read from the browser after it loads. Their own words, never a system path. */
function EmptyAddress() {
  const [address, setAddress] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAddress(`${window.location.host}${window.location.pathname}`.slice(0, 80)));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <figure className={styles.emptyPage} aria-label="The address you opened, with nothing on it">
    <span className={styles.emptyAddress}>{address || "This address"}</span>
    <span className={styles.emptyBody} aria-hidden="true" />
  </figure>;
}

/** A link that is not there. Anyone can land here, signed in or not. Pebble is looking at the empty address. */
export function XaNotFound({ mode, homeHref = "/", workspaceHref = "/workspace" }: { mode?: Mode; homeHref?: string; workspaceHref?: string }) {
  return <XaEntryFrame mode={mode} label="Page not found" wide>
    <div className={styles.measure}>
    <XaEntryStack>
      <XaHeadline size="lg" quiet="The link may be old or mistyped.">This page isn’t here.</XaHeadline>
      <div className={styles.actions}><XaButtonLink variant="primary" size="lg" href={homeHref}>Go to Strelva</XaButtonLink></div>
      <Links>{[<XaTextLink key="w" href={workspaceHref}>Open your workspace</XaTextLink>, <XaTextLink key="s" href="/sign-in">Sign in</XaTextLink>]}</Links>
      <Ground pose="alone" object={<EmptyAddress />} />
    </XaEntryStack>
    </div>
  </XaEntryFrame>;
}

/**
 * A page broke while showing. The error is already reported (the caller
 * captures it); the person gets one way forward and one way out.
 */
export function XaPageBroke({ mode, onRetry, homeHref = "/", homeLabel = "Go to Strelva", where = "this page" }: { mode?: Mode; onRetry: () => void; homeHref?: string; homeLabel?: string; where?: string }) {
  return <XaEntryFrame mode={mode} label="Something went wrong" wide>
    <div className={styles.measure}>
    <XaEntryStack>
      <XaHeadline size="lg" quiet="Nothing was sent or changed.">{`Strelva couldn’t show ${where}.`}</XaHeadline>
      <div className={styles.actions}><XaButton variant="primary" size="lg" onClick={onRetry}>Try again</XaButton><XaTextLink href={homeHref}>{homeLabel}</XaTextLink></div>
      <Ground pose="fixing">Strelva got the details when it broke, so you don’t need to describe it. <XaTextLink href="/workspace?view=help">Get help</XaTextLink></Ground>
    </XaEntryStack>
    </div>
  </XaEntryFrame>;
}

/** The workspace release is off in this environment: one headline, one quiet line, one action. */
export function XaNotOpenYet({ mode, place = "workspace" }: { mode?: Mode; place?: "workspace" | "getting-started" }) {
  return <XaEntryFrame mode={mode} label={place === "getting-started" ? "Getting started opens soon" : "Workspaces open soon"} wide>
    <div className={styles.measure}>
    <XaEntryStack>
      <XaHeadline size="lg" quiet="Your site and bookings keep running.">{place === "getting-started" ? "Getting started opens soon." : "Workspaces open soon."}</XaHeadline>
      <div className={styles.actions}><XaButtonLink variant="primary" size="lg" href="/account">Open your existing account</XaButtonLink></div>
      <Ground pose="resting" />
    </XaEntryStack>
    </div>
  </XaEntryFrame>;
}

/** Opening a workspace: Pebble beside the Working line, where the page's headline will be. Rendered inside the shell skeleton. */
export function XaWorkspaceOpening({ label = "Opening your workspace" }: { label?: string }) {
  return <div className={styles.page}><div className={styles.opening}>
    <XaPebbleAvatar size={32} />
    <XaWorking title={label} steps={[]} />
  </div></div>;
}

type UnopenedReason = "sign-in" | "forbidden" | "gone" | "failed";

/**
 * The workspace could not open (WorkspaceApp, before any snapshot): signed
 * out, not allowed, gone, or a failed read. Inside the real shell, so the
 * page is where the workspace will be once it opens. Left-aligned with the
 * content column; Pebble speaks once at the foot, as on R1.
 */
export function XaWorkspaceUnopened({ reason, message, signInHref, accountHref, onRetry }: { reason: UnopenedReason; message?: string; signInHref: string; accountHref: string; onRetry: () => void }) {
  // The server's own words for a refusal (401, 403, 404) stay visible: it may name the email or the owner. A failed read shows none (it is system language).
  const said = message && reason !== "failed" ? <p className={styles.body} role="alert">{message}</p> : null;
  const content: Record<UnopenedReason, { title: string; quiet: string; action: ReactNode; pebble: ReactNode }> = {
    "sign-in": { title: "Sign in to open your workspace.", quiet: "Your place is kept for after you sign in.", action: <XaButtonLink variant="primary" href={signInHref}>Sign in</XaButtonLink>, pebble: "I’ll bring you back to this page once you’re in." },
    forbidden: { title: "This account can’t open this workspace.", quiet: "Nothing in it was shown or changed.", action: <XaButtonLink variant="primary" href={accountHref}>Choose another workspace</XaButtonLink>, pebble: "Ask its owner to invite the email you sign in with." },
    gone: { title: "This workspace isn’t available anymore.", quiet: "Nothing in it was shown or changed.", action: <XaButtonLink variant="primary" href={accountHref}>Choose another workspace</XaButtonLink>, pebble: "The link may be out of date. Ask its owner for a current one." },
    failed: { title: "Strelva couldn’t reach your workspace.", quiet: "Nothing in it changed.", action: <XaButton variant="primary" onClick={onRetry}>Try again</XaButton>, pebble: <>Trying again reads it fresh. <XaTextLink href={accountHref}>Check your account</XaTextLink></> },
  };
  const state = content[reason];
  return <div className={styles.page}><section className={styles.state} aria-label={state.title}>
    <XaHeadline size="sm" quiet={state.quiet}>{state.title}</XaHeadline>
    {said}
    <div className={styles.actions}>{state.action}</div>
    <div className={styles.says}><XaPebbleAvatar size={32} /><p>{state.pebble}</p></div>
  </section></div>;
}

/** An agency person in a client shared read-only, with nothing shared yet. */
export function XaSharedReadOnlyEmpty({ business }: { business?: string }) {
  return <div className={styles.page}><section className={styles.state} aria-label="Nothing shared yet">
    <XaHeadline size="sm" quiet="New work shows here when the client adds it.">{`${business || "This client"} shared this with you to read.`}</XaHeadline>
    <div className={styles.says}><XaPebbleAvatar size={32} /><p>Only the client can make or change work here. I’ll keep this page current.</p></div>
  </section></div>;
}
