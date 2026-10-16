import type { CSSProperties, ReactNode } from "react";
import { visitorBrandStyle, type VisitorBrand } from "@/products/websites/client";
import styles from "./visitor.module.css";

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/**
 * The visitor's page is the business's page: its logo or name heads it, its
 * own colors (`brand`, read from its website or recorded branding) fill the
 * --visitor-* variables, and its phone sits in the header as a tap-to-call
 * link. Strelva appears once, as a quiet "Runs on Strelva" under the page.
 * Without a brand the page keeps neutral paper and ink, and dark follows the
 * visitor's own device. A missing business identity is left out, never
 * replaced with a placeholder or with Strelva.
 */
export function VisitorBookingShell({ children, siteName, navigation, wide = false, reading = false, brand, phone }: {
  children: ReactNode;
  siteName?: string;
  navigation?: ReactNode;
  wide?: boolean;
  /** The name is still being read: hold its place instead of calling it unavailable. */
  reading?: boolean;
  /** The business's own look. */
  brand?: VisitorBrand | null;
  /** The business's phone, as its header shows it. */
  phone?: string | null;
}) {
  const name = siteName?.trim();
  const mark = brand?.logo ? <img className={styles.logo} src={brand.logo.url} alt={name || brand.logo.alt} /> : name ? <span>{name}</span> : null;
  const home = mark && brand?.website ? <a className={styles.brandLink} href={brand.website}>{mark}</a> : mark;
  const call = phone?.trim() ? <a className={styles.headerCall} href={telHref(phone)} aria-label={`Call ${name || "the business"} at ${phone}`}>{phone}</a> : null;
  return <main className={styles.shell} style={visitorBrandStyle(brand) as CSSProperties} data-branded={brand ? true : undefined}><div className={wide ? styles.wide : styles.column}>
    {/* An unknown business is left unnamed rather than labeled "unavailable": the page's sentence says what happened. */}
    {name || reading || navigation || brand?.logo ? <header className={styles.header}>
      {reading && !name ? <span className={`${styles.skeleton} ${styles.brandHold}`} aria-hidden="true" /> : home ? <p className={styles.brand}>{home}</p> : null}
      {navigation || call ? <nav className={styles.navigation} aria-label="Business website">{navigation}{call}</nav> : null}
    </header> : null}
    {children}
    <footer className={styles.credit}>Runs on Strelva</footer>
  </div></main>;
}
