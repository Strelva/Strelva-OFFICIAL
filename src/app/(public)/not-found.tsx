import Link from "next/link";
import styles from "@/components/public/site-pages.module.css";

/**
 * Not found, inside a business's own site (a tenant host or a hosted page that
 * does not exist). The site's header and footer stay around it; Strelva is
 * never named. Platform hosts never reach this file: the layout sends them to
 * the root not-found before it renders.
 */
export default function SiteNotFound() {
  return <section className={`${styles.page} ${styles.narrow}`} aria-labelledby="site-missing-title">
    <h1 id="site-missing-title" className={styles.title}>We couldn&apos;t find that page</h1>
    <p className={styles.lede}>The link may be old or mistyped. Everything else on this site is where it was.</p>
    <div className={styles.actions}>
      <Link href="/" className={styles.primary} data-xa-primary>Go to the home page</Link>
    </div>
  </section>;
}
