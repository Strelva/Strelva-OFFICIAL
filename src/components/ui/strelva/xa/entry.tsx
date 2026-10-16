/**
 * XA entry frame. Pen: XA · B1 (sign up), B2, B3, B4 and C1 (claim page):
 * paper on the left with one column of words and fields, the felt on the
 * right where Pebble does the job the page is about. Every way back into
 * Strelva uses it: sign in, which business, no access, the free check,
 * the claim and the request when sign-up is closed.
 *
 * Phone (390): no felt slab. The art shrinks into the column above the
 * headline, so the phone reads as its own layout rather than a stacked
 * desktop (E6).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { XaPebbleScene, type XaPose } from "./characters";
import { XaInitial, XaMark } from "./state";
import styles from "./entry.module.css";

function isOwnerBrand(value: unknown): value is OwnerBrand {
  return Boolean(value && typeof value === "object" && "name" in value && "agencyId" in value);
}

/** Whose door this is: Strelva's mark, or the agency that runs it for the business. */
export function XaEntryBrand({ brand, fontFamily, href = "/" }: { brand?: ReactNode | OwnerBrand; fontFamily?: string; href?: string }) {
  if (isOwnerBrand(brand) && brand.name !== "Strelva") {
    const known = Boolean(brand.agencyId);
    return <Link href={href} className={styles.brand} style={fontFamily ? { fontFamily } : undefined} data-agency-brand={brand.agencyId ?? undefined}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" className={styles.brandLogo} /> : <XaInitial name={brand.name} color={known ? brand.accentColor : undefined} size={26} />}
      <span className={styles.brandText}><span>{brand.name}</span>{known ? <small>Runs on Strelva</small> : null}</span>
    </Link>;
  }
  if (brand && !isOwnerBrand(brand)) return <Link href={href} className={styles.brand} style={fontFamily ? { fontFamily } : undefined}>{brand}</Link>;
  return <Link href={href} className={styles.brand} aria-label="Strelva home"><XaMark size={26} /><span className={styles.wordmark}>Strelva</span></Link>;
}

/** The felt: Pebble doing the page's job, with one line that says what it means. */
export function XaEntryFelt({ pose, title, children, object }: { pose?: XaPose; title?: ReactNode; children?: ReactNode; object?: ReactNode }) {
  return <div className={styles.felt}>
    <div className={styles.feltInner}>
      {pose ? <XaPebbleScene pose={pose} size={object ? 260 : 340} bare /> : null}
      {object ? <div className={styles.feltObject}>{object}</div> : null}
      {title ? <p className={styles.feltTitle}>{title}</p> : null}
      {children ? <p className={styles.feltBody}>{children}</p> : null}
    </div>
  </div>;
}

/**
 * The frame. `felt` is the right-hand panel (desktop); `phoneArt` is the
 * small pose shown above the words on a phone. `end` sits at the top right
 * (Sign in, the signed-in person, or the business's own host). `footnote`
 * is the one quiet line at the bottom of the column.
 */
export function XaEntryFrame({ children, brand, brandFontFamily, end, felt, phoneArt, phoneObject, footnote, mode, wide = false, label }: {
  children: ReactNode;
  /** The felt's object (a Page, a check) repeated inside the column on a phone, where the felt is gone. */
  phoneObject?: ReactNode;
  brand?: ReactNode | OwnerBrand;
  brandFontFamily?: string;
  end?: ReactNode;
  felt?: ReactNode;
  phoneArt?: XaPose;
  footnote?: ReactNode;
  mode?: "light" | "dark";
  /** The column grows to 640 for results (the check) instead of a 460 form. */
  wide?: boolean;
  label?: string;
}) {
  return <div data-workspace-mode={mode} className={styles.modeRoot}>
    <div data-workspace-theme="linen" className={styles.frame} data-felt={felt ? true : undefined}>
      <div className={styles.paper}>
        <header className={styles.header}><XaEntryBrand brand={brand} fontFamily={brandFontFamily} />{end ? <div className={styles.end}>{end}</div> : null}</header>
        <main className={styles.column} data-wide={wide || undefined} aria-label={label}>
          {phoneArt ? <div className={styles.phoneArt}><XaPebbleScene pose={phoneArt} size={128} /></div> : null}
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
