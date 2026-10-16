"use client";
/**
 * XA · A1 (and the business half of B1): make a Strelva account. The two doors
 * are one segmented choice above the email. Each side is a link, so the door
 * survives a reload, a shared link and a browser with no script.
 * Sign-in itself is SupabaseSignIn: Supabase Auth stays the only login.
 */
import type { ReactNode } from "react";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { XaEntry, XaEntryCaption, XaHeadline, XaPebbleScene } from "@/components/ui/strelva/Xa";
import styles from "./agency-door.module.css";

export type AccountDoorKind = "business" | "agency";

export function accountDoorHref(kind: AccountDoorKind, next: string | null): string {
  const query = new URLSearchParams();
  if (kind === "agency") query.set("as", "agency");
  else if (next) query.set("next", next);
  return query.size ? `/sign-up?${query}` : "/sign-up";
}

const DOOR_COPY: Record<AccountDoorKind, { quiet: string; emailLabel: string; caption: string; detail: string }> = {
  agency: {
    quiet: "Use the email you run your agency with.",
    emailLabel: "Work email",
    caption: "Every client, in one place.",
    detail: "Each client owns their business. Your name goes on the work you prepare, and they say yes.",
  },
  business: {
    quiet: "Use the email you run your business with.",
    emailLabel: "Email",
    caption: "Your business, in one place.",
    detail: "Start with the website you have. Bring in an agency any time.",
  },
};

/**
 * `choice` is false when only one door is open; the segmented control then
 * disappears instead of offering a door that leads nowhere.
 */
export function AccountDoor({ kind, choice, next, requestedNext, emailReady, signInHref, title = "Make your Strelva account.", footnote, mode }: {
  kind: AccountDoorKind; choice: boolean; next: string; requestedNext: string | null; emailReady: boolean; signInHref: string;
  title?: ReactNode; footnote?: ReactNode; mode?: "light" | "dark";
}) {
  const copy = DOOR_COPY[kind];
  return <XaEntry mode={mode} corner={<a href={signInHref}>Sign in</a>} footnote={footnote}
    aside={<>
      <XaPebbleScene pose={kind === "agency" ? "lineup" : "website"} size={360} bare label={kind === "agency" ? "Pebble beside a row of client Systems" : "The website clay, ready to be brought in"} />
      <XaEntryCaption title={copy.caption}>{copy.detail}</XaEntryCaption>
    </>}>
    <SupabaseSignIn appearance="xa" key={next} next={next} emailReady={emailReady} emailLabel={copy.emailLabel}
      heading={<>
        <XaHeadline quiet={copy.quiet}>{title}</XaHeadline>
        {choice ? <nav className={styles.doors} aria-label="Who is this for?">
          {(["business", "agency"] as const).map(door => <a key={door} className={styles.door} href={accountDoorHref(door, requestedNext)} aria-current={door === kind ? "page" : undefined}>{door === "business" ? "I run a business" : "I run work for clients"}</a>)}
        </nav> : null}
      </>} />
    <p className="mt-6 text-[14px] text-[var(--st-text-2)]">Already have an account? <a className="font-medium text-[var(--st-accent)] hover:underline" href={signInHref}>Sign in</a></p>
  </XaEntry>;
}
