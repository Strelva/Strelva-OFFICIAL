/**
 * XA entry frame. Pen: XA · B1 (sign up), B2, B3, B4 and C1 (claim page):
 * paper on the left with one column of words and fields, the felt on the
 * right where Pebble does the job the page is about. Every way back into
 * Strelva uses it: sign in, which business, no access, the free check,
 * the claim and the request when sign-up is closed.
 *
 * Phone (390): no felt slab and no shrunken scene. Pebble says the felt's
 * one sentence above the headline (`phoneSays`), and a felt object the page
 * depends on (the read page, a broken link) moves into the column
 * (`phoneObject`), so the phone reads as its own layout (E6).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { XaPebbleAvatar, XaPebbleScene, type XaPose } from "./characters";
import { XaMark } from "./state";
import { XaPage } from "./surfaces";
import styles from "./entry.module.css";

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
    return <Link href={href} className={styles.brand} style={font} data-agency-brand={brand.agencyId}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" className={styles.brandLogo} /> : null}
      <span className={styles.brandText}><span>{brand.name}</span>{credit ? <small>Runs on Strelva</small> : null}</span>
    </Link>;
  }
  if (brand && !isOwnerBrand(brand)) return <Link href={href} className={styles.brand} style={font}>{brand}</Link>;
  if (businessName?.trim()) return <Link href={href} className={styles.brand} style={font} data-brand-neutral="true">
    <span className={styles.brandText}><span>{businessName.trim()}</span>{credit ? <small>Runs on Strelva</small> : null}</span>
  </Link>;
  return <Link href={href} className={styles.brand} aria-label="Strelva home"><XaMark size={26} /><span className={styles.wordmark}>Strelva</span></Link>;
}

/** Pebble saying one sentence: the felt's job on a phone, or beside a felt object on desktop. */
export function XaEntryPebbleLine({ children }: { children: ReactNode }) {
  return <p className={styles.pebbleLine}><XaPebbleAvatar size={28} /><span>{children}</span></p>;
}

/** The felt: Pebble doing the page's job, with one line that says what it means. */
export function XaEntryFelt({ pose, title, children, object, poseSize }: { pose?: XaPose; title?: ReactNode; children?: ReactNode; object?: ReactNode; poseSize?: number }) {
  return <div className={styles.felt}>
    <div className={styles.feltInner} data-object={object ? true : undefined}>
      {pose ? <XaPebbleScene pose={pose} size={poseSize ?? (object ? 220 : 340)} bare /> : null}
      {object ? <div className={styles.feltObject}>{object}</div> : null}
      {title ? <p className={styles.feltTitle}>{title}</p> : null}
      {children ? <p className={styles.feltBody}>{children}</p> : null}
    </div>
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
 * The frame. `felt` is the right-hand panel (desktop); `phoneSays` is the
 * sentence Pebble says above the words on a phone, where the felt is gone. `end` sits at the top right
 * (Sign in, the signed-in person, or the business's own host). `footnote`
 * is the one quiet line at the bottom of the column.
 */
export function XaEntryFrame({ children, brand, businessName, brandCredit = true, brandFontFamily, end, felt, phoneSays, phoneObject, footnote, mode, wide = false, label }: {
  children: ReactNode;
  /** The felt's object (a Page, a check) repeated inside the column on a phone, where the felt is gone. */
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
  return <div data-workspace-mode={mode} className={styles.modeRoot}>
    <div data-workspace-theme="linen" className={styles.frame} data-felt={felt ? true : undefined}>
      <div className={styles.paper}>
        <header className={styles.header}><XaEntryBrand brand={brand} businessName={businessName} credit={brandCredit} fontFamily={brandFontFamily} />{end ? <div className={styles.end}>{end}</div> : null}</header>
        <main className={styles.column} data-wide={wide || undefined} aria-label={label}>
          {phoneSays ? <div className={styles.phoneArt}><XaEntryPebbleLine>{phoneSays}</XaEntryPebbleLine></div> : null}
          {children}
          {phoneObject ? <div className={styles.phoneObject}>{phoneObject}</div> : null}
        </main>
        {footnote ? <footer className={styles.footnote}>{footnote}</footer> : null}
      </div>
      {felt ? <aside className={styles.feltSlot} aria-label="What this means">{felt}</aside> : null}
    </div>
  </div>;
}

/** The column's stack: a gap of 24 between blocks, 12 inside a group. */
export function XaEntryStack({ children, gap = "md" }: { children: ReactNode; gap?: "sm" | "md" | "lg" }) {
  return <div className={styles.stack} data-gap={gap}>{children}</div>;
}

/** A quiet line of words under a form: links inside, no box. */
export function XaEntryNote({ children, id, role }: { children: ReactNode; id?: string; role?: "status" | "alert" }) {
  return <p className={styles.note} id={id} role={role}>{children}</p>;
}
