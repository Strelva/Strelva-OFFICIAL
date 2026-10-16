/**
 * The page someone opens from a contribution link (XA): the work itself as a
 * plain document (no browser chrome), the one sentence of what is shared under
 * it, then their proposal and its review.
 */
import type { ReactNode } from "react";
import { XaButtonLink, XaEmpty, XaHeadline } from "@/components/ui/strelva/Xa";
import { XaNote } from "@/components/ui/strelva/Xa";
import styles from "./work-authority.module.css";

export function ContributionPage({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return <>
    <div className={styles.page}>
      <XaHeadline quiet="Suggest your changes below. The business decides.">{title}.</XaHeadline>
      {text !== undefined ? <>
        <article className={styles.sheet} aria-label={`${title}, as it is now`}><p className={styles.document}>{text || "Nothing is written yet."}</p></article>
        <XaNote>Only this is shared with you, nothing else in the business.</XaNote>
      </> : <XaNote>What you can do and what you&apos;ve sent are below.</XaNote>}
    </div>
    {children}
  </>;
}

export function ContributionClosed({ kind }: { kind: "off" | "invalid" | "denied" | "error" }) {
  const copy = {
    off: { title: "Contributions aren't open yet", body: "Nothing was shared with your account.", job: "Waiting for contributions to open." },
    invalid: { title: "This contribution link isn't right", body: "Check the link you were sent, or ask for a new one.", job: "Nothing was opened or changed." },
    denied: { title: "This work isn't available to your account", body: "Access may have ended or been taken back. Use the verified account that was invited.", job: "Keeping the work closed to this account." },
    error: { title: "This work couldn't be opened", body: "Your proposal hasn't changed. Reload the page to try again.", job: "Nothing you sent was lost." },
  }[kind];
  return <div className={styles.page}><div role="alert"><XaEmpty pose={kind === "error" ? "fixing" : "alone"} title={copy.title} job={copy.job}
    action={<XaButtonLink variant="primary" size="lg" href={kind === "off" ? "/account" : "/workspace"}>{kind === "off" ? "Open your account" : "Return to your work"}</XaButtonLink>}>{copy.body}</XaEmpty></div></div>;
}
