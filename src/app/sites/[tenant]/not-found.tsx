"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/public/site-pages.module.css";

/** Not found on a path-mounted business site (/sites/[tenant]/...). Home is the site's own root, never Strelva's. */
export default function HostedSiteNotFound() {
  const tenant = /^\/sites\/([a-z0-9-]+)/.exec(usePathname() ?? "")?.[1];
  return <section className={`${styles.page} ${styles.narrow}`} aria-labelledby="hosted-missing-title">
    <h1 id="hosted-missing-title" className={styles.title}>We couldn&apos;t find that page</h1>
    <p className={styles.lede}>The link may be old or mistyped, or this site isn&apos;t published right now.</p>
    {tenant ? <div className={styles.actions}><Link href={`/sites/${tenant}`} className={styles.primary} data-xa-primary>Go to the home page</Link></div> : null}
  </section>;
}
