/**
 * XA entry: the frame for getting in, before a business has a workspace
 * shell. Pen: XA · B1–B5 (T5dNV, K5GJ0c, W1oNFU, WfW7X, J22w90) and the same
 * frame in XA · A1–A2 for agencies.
 *
 * Paper on the left with the lockup, one column and a quiet note. The felt
 * stage on the right shows Pebble doing the job this step is about, with one
 * caption that says what happens next. Below 1024 px the stage steps aside:
 * the column is the screen, and Pebble speaks where Strelva speaks.
 *
 * Added by lane XA-1 (business door) and shared with the agency door (XA-2):
 * one frame for both. A page either passes `stage` (Pebble with a caption,
 * which steps aside below 1100 px) or `aside` (a free felt panel, such as a
 * true preview of what someone else will see, which stacks under the task on
 * phones unless asideOnPhone="hidden").
 *
 * Lane XS-entry (sign in, which business, no access, the free check, the
 * claim, the request when sign-up is closed) adds XaEntryFrame on top of the
 * same frame, with XaEntryFelt for the felt's content, XaEntryBrand for whose
 * door it is, XaEntryBrokenLink for bad news about a link, XaEntryPebbleLine
 * and XaEntryNote. On a phone the felt is gone: Pebble says its one sentence
 * above the words (`phoneSays`) and an object the page depends on moves into
 * the column (`phoneObject`).
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { StrelvaLockup } from "@/components/brand/StrelvaLockup";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { XaPebbleAvatar, XaPebbleScene, type XaPose } from "./characters";
import { XaMark } from "./state";
import { XaPage } from "./surfaces";
import styles from "./entry.module.css";

export interface XaEntryStage {
  pose: XaPose;
  /** What Pebble is doing, for screen readers. */
  label: string;
  /** One caption only the stage can say. Omit it when the object already says it. */
  title?: ReactNode;
  body?: ReactNode;
  /** A real object beside Pebble, such as the page that was read. */
  object?: ReactNode;
  /** Changes when the object is a new thing, so it settles in again (Slow, settle). */
  objectKey?: string;
  /**
   * Below 1100 px the stage steps aside. This one line keeps Pebble in frame
   * on a phone, above the column: the promise on B1, the first ask on B2.
   */
  phone?: ReactNode;
}

/** The entry frame. `account` sits top right (Sign in, or the signed-in person). */
export function XaEntry({ children, account, corner, foot, footnote, stage, aside, asideOnPhone = "below", mode, width = "form", homeHref = "/", brand, brandNode, label = "Strelva", phoneSays, phoneObject, regionLabel }: {
  children: ReactNode;
  /**
   * The agency whose door this is (an invitation or a claim). Owners see their
   * agency's name, never Strelva in its place; foot then says "Runs on Strelva".
   */
  brand?: { name: string; logoUrl?: string | null };
  account?: ReactNode;
  /** Same as `account`. */
  corner?: ReactNode;
  foot?: ReactNode;
  /** Same as `foot`. */
  footnote?: ReactNode;
  stage?: XaEntryStage;
  /** A free felt panel in place of `stage`: what this step leads to. */
  aside?: ReactNode;
  /** "below" (default) stacks the free panel under the task on phones; "hidden" drops it there. */
  asideOnPhone?: "below" | "hidden";
  mode?: "light" | "dark";
  /** "wide" for a review the person reads line by line; "form" otherwise. */
  width?: "form" | "wide" | "results";
  homeHref?: string;
  label?: string;
  /** The whole brand slot, top left, in place of `brand` or the lockup (XaEntryBrand). */
  brandNode?: ReactNode;
  /** Below 1100 px, where the panel is gone: Pebble's one sentence above the words. */
  phoneSays?: ReactNode;
  /** Below 1100 px: the panel's object the page depends on, moved into the column. */
  phoneObject?: ReactNode;
  /** A name for the column when the page has no heading that says it. */
  regionLabel?: string;
}) {
  account ??= corner;
  foot ??= footnote;
  const panel = stage ? "stage" : aside ? "free" : undefined;
  return <main className={styles.entry} data-workspace-theme="linen" data-workspace-mode={mode} data-staged={panel ? true : undefined}>
    <div className={styles.left}>
      <header className={styles.top}>
        {brandNode ? brandNode : brand ? <span className={styles.brand}>{brand.logoUrl ? <img src={brand.logoUrl} alt="" width={24} height={24} /> : null}{brand.name}</span>
          : <Link href={homeHref} className={styles.home} aria-label={`${label} home`}><StrelvaLockup className={styles.lockup} /></Link>}
        {account ? <div className={styles.account}>{account}</div> : null}
      </header>
      <div className={styles.column} data-width={width} role={regionLabel ? "region" : undefined} aria-label={regionLabel}>
        {stage?.phone ?? phoneSays ? <p className={styles.phoneStage}><XaPebbleAvatar size={36} /><span>{stage?.phone ?? phoneSays}</span></p> : null}
        {children}
        {phoneObject ? <div className={styles.phoneObject}>{phoneObject}</div> : null}
      </div>
      {foot ? <footer className={styles.foot}>{foot}</footer> : null}
    </div>
    {stage ? <aside className={styles.stage} aria-label={stage.label}>
      <div className={styles.art} style={{ "--xa-art": `${stage.object ? 300 : 440}px` } as CSSProperties}><XaPebbleScene pose={stage.pose} size={stage.object ? 300 : 440} bare label={stage.label} /></div>
      {stage.object ? <div key={stage.objectKey} className={styles.object}>{stage.object}</div> : null}
      {stage.title || stage.body ? <div className={styles.caption} aria-live="polite">
        {stage.title ? <p className={styles.captionTitle}>{stage.title}</p> : null}
        {stage.body ? <p className={styles.captionBody}>{stage.body}</p> : null}
      </div> : null}
    </aside> : aside ? <aside className={styles.stage} data-free="true" data-phone={asideOnPhone}>{aside}</aside> : null}
  </main>;
}

/** Where this person is in getting started. Done steps stay moss; the current one is named in ink. */
export function XaEntrySteps({ steps, current, label = "Getting started" }: { steps: readonly string[]; current: number; label?: string }) {
  return <ol className={styles.steps} aria-label={label} style={{ "--xa-steps": steps.length } as CSSProperties}>
    {steps.map((step, index) => <li key={step} className={styles.step} data-done={index < current || undefined} aria-current={index === current ? "step" : undefined}>
      <span className={styles.stepBar} aria-hidden="true" />
      <span>{step}<span className={styles.srOnly}>{index < current ? ", done" : index === current ? ", current step" : ""}</span></span>
    </li>)}
  </ol>;
}

/**
 * Two doors as links in a segmented track (Use it yourself / Run it for
 * others, GLOSSARY). Each is a page of its own, so it works before any script loads.
 */
export function XaEntryDoors({ label, options }: { label: string; options: readonly { href: string; label: string; current: boolean }[] }) {
  return <nav className={styles.doors} aria-label={label}>
    {options.map(option => <Link key={option.href} href={option.href} className={styles.door} aria-current={option.current ? "page" : undefined}>{option.label}</Link>)}
  </nav>;
}

/** A caption under the felt panel's art: one line that names what is true, one quieter line under it. */
export function XaEntryCaption({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className={styles.caption}><p className={styles.captionTitle}>{title}</p>{children ? <p className={styles.captionBody}>{children}</p> : null}</div>;
}

/** The stack inside the entry column: headline, facts, actions, with the board's rhythm. */
export function XaEntryStack({ children, gap = "md" }: { children: ReactNode; gap?: "sm" | "md" | "lg" }) {
  return <div className={styles.stack} data-gap={gap}>{children}</div>;
}

function isOwnerBrand(value: unknown): value is OwnerBrand {
  return Boolean(value && typeof value === "object" && "name" in value && "agencyId" in value);
}

/**
 * Whose door this is. A resolved agency shows its logo, or its name in text
 * (never a letter in a coloured square), with "Runs on Strelva" once. When no
 * agency resolves, the door is neutral: the business's name in text with the
 * Strelva credit, or Strelva's wordmark when no business is known either.
 * The system fallback name ("Agency identity unavailable") is never shown.
 */
export function XaEntryBrand({ brand, businessName, fontFamily, href = "/", credit = true }: { brand?: ReactNode | OwnerBrand; businessName?: string; fontFamily?: string; href?: string; credit?: boolean }) {
  const font = fontFamily ? { fontFamily } : undefined;
  if (isOwnerBrand(brand) && brand.agencyId) {
    return <Link href={href} className={styles.entryBrand} style={font} data-agency-brand={brand.agencyId}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" className={styles.brandLogo} /> : null}
      <span className={styles.brandText}><span>{brand.name}</span>{credit ? <small>Runs on Strelva</small> : null}</span>
    </Link>;
  }
  if (brand && !isOwnerBrand(brand)) return <Link href={href} className={styles.entryBrand} style={font}>{brand}</Link>;
  if (businessName?.trim()) return <Link href={href} className={styles.entryBrand} style={font} data-brand-neutral="true">
    <span className={styles.brandText}><span>{businessName.trim()}</span>{credit ? <small>Runs on Strelva</small> : null}</span>
  </Link>;
  return <Link href={href} className={styles.entryBrand} aria-label="Strelva home"><XaMark size={26} /><span className={styles.wordmark}>Strelva</span></Link>;
}

/** Pebble saying one sentence: the felt's job on a phone, or beside a felt object on desktop. */
export function XaEntryPebbleLine({ children }: { children: ReactNode }) {
  return <p className={styles.pebbleLine}><XaPebbleAvatar size={28} /><span>{children}</span></p>;
}

/** What the felt panel holds: Pebble doing the page's job, with one line that says what it means. The frame draws the felt itself. */
export function XaEntryFelt({ pose, title, children, object, poseSize }: { pose?: XaPose; title?: ReactNode; children?: ReactNode; object?: ReactNode; poseSize?: number }) {
  return <div className={styles.feltInner} data-object={object ? true : undefined}>
    {pose ? <XaPebbleScene pose={pose} size={poseSize ?? (object ? 220 : 340)} bare /> : null}
    {object ? <div className={styles.feltObject}>{object}</div> : null}
    {title ? <p className={styles.feltTitle}>{title}</p> : null}
    {children ? <p className={styles.feltBody}>{children}</p> : null}
  </div>;
}

/**
 * The broken link, for bad news about a link: the address it pointed at and
 * the page that no longer opens, with Pebble already holding the way back.
 */
export function XaEntryBrokenLink({ address, title, children }: { address: string; title: ReactNode; children?: ReactNode }) {
  return <div className={styles.broken}>
    <XaPebbleScene pose="fixing" size={200} bare />
    <XaPage address={address} label={`${address}, no longer opens`}>
      <p className={styles.brokenTitle}>{title}</p>
      <span className={styles.brokenLine} aria-hidden="true" />
      <span className={styles.brokenLine} data-short="true" aria-hidden="true" />
    </XaPage>
    {children ? <XaEntryPebbleLine>{children}</XaEntryPebbleLine> : null}
  </div>;
}

/**
 * XaEntry with the XS-entry vocabulary: `felt` is the right-hand panel
 * (desktop only), `end` sits top right, `wide` opens the column for results.
 */
export function XaEntryFrame({ children, brand, businessName, brandCredit = true, brandFontFamily, end, felt, phoneSays, phoneObject, footnote, mode, wide = false, label }: {
  children: ReactNode;
  phoneObject?: ReactNode;
  brand?: ReactNode | OwnerBrand;
  /** The business this door is for, shown when no agency brand resolves. */
  businessName?: string;
  /** False when the footnote already carries "Runs on Strelva". */
  brandCredit?: boolean;
  brandFontFamily?: string;
  end?: ReactNode;
  felt?: ReactNode;
  phoneSays?: ReactNode;
  footnote?: ReactNode;
  mode?: "light" | "dark";
  /** The column grows to 640 for results (the check) instead of a 460 form. */
  wide?: boolean;
  label?: string;
}) {
  return <XaEntry mode={mode} account={end} foot={footnote} aside={felt} asideOnPhone="hidden" width={wide ? "results" : "form"}
    brandNode={<XaEntryBrand brand={brand} businessName={businessName} credit={brandCredit} fontFamily={brandFontFamily} />}
    phoneSays={phoneSays} phoneObject={phoneObject} regionLabel={label}>
    {children}
  </XaEntry>;
}

/** A quiet line of words under a form: links inside, no box. */
export function XaEntryNote({ children, id, role }: { children: ReactNode; id?: string; role?: "status" | "alert" }) {
  return <p className={styles.note} id={id} role={role}>{children}</p>;
}
