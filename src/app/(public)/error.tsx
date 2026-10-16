"use client";

import Link from "next/link";
import styles from "@/components/public/site-pages.module.css";

/**
 * Error boundary for the public client-site render tree. A paying client's own
 * visitors see this, so it stays inside the business's page, brand-neutral,
 * and never shows internal detail. Most transient backend errors are caught
 * upstream (layout and section renderer fall back to defaults); this is the
 * last net, so a render failure becomes a polite retry, not a framework screen.
 */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return <section className={`${styles.page} ${styles.narrow}`} aria-labelledby="site-error-title">
    <h1 id="site-error-title" className={styles.title}>This page didn&apos;t load</h1>
    <p className={styles.lede} role="alert">Something went wrong while loading it. Try again in a moment.</p>
    <div className={styles.actions}>
      <button type="button" onClick={reset} className={styles.primary} data-xa-primary>Try again</button>
      <Link href="/" className={styles.text}>Go to the home page</Link>
    </div>
  </section>;
}
