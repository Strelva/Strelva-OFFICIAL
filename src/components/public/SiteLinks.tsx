import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./site-pages.module.css";

export type SiteLinkKind = "booking" | "calendar" | "instagram" | "email" | "phone";
export interface SiteLinkItem { title: string; url: string; icon: SiteLinkKind; featured: boolean; external: boolean }

const DOES: Record<SiteLinkKind, string> = {
  booking: "Pick a time online",
  calendar: "The next event",
  instagram: "Opens Instagram",
  email: "Writes an email",
  phone: "Calls from your phone",
};

/**
 * The link-in-bio page (/links), October 16 in the XA restraint: the business,
 * its one main link as the page's only filled button, then open rows that each
 * say where they go. No gradient, glass, uppercase or hover zoom.
 */
export function SiteLinks({ siteName, tagline, links, logoUrl }: { siteName: string; tagline?: string; links: readonly SiteLinkItem[]; /** The business's own logo; with none, the name leads on its own (never an initial in a tile). */ logoUrl?: string | null }) {
  const name = siteName.trim() || "Links";
  const main = links.find(link => link.featured);
  const rest = links.filter(link => link !== main);
  return <section className={`${styles.page} ${styles.narrow}`} aria-labelledby="site-links-name">
    <div className={styles.who}>
      {logoUrl && /^(https:\/\/|\/(?!\/))/.test(logoUrl) ? <img src={logoUrl} alt="" className={styles.logo} width={56} height={56} /> : null}
      <div><h1 id="site-links-name" className={styles.name}>{name}</h1>{tagline ? <p className={styles.tagline}>{tagline}</p> : null}</div>
    </div>
    {main ? <div className={styles.main}><a href={main.url} target="_blank" rel="noopener noreferrer" className={styles.primary} data-xa-primary>{main.title}</a></div> : null}
    {rest.length ? <ul className={styles.rows} aria-label={`More from ${name}`}>
      {rest.map(link => <li key={`${link.icon}:${link.url}`}>
        <a href={link.url} {...(link.external && /^https?:/.test(link.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={styles.row}>
          <span className={styles.rowText}><span className={styles.rowTitle}>{link.title}</span><span className={styles.rowDetail}>{DOES[link.icon]}</span></span>
          <ArrowUpRight size={18} className={styles.rowGo} aria-hidden="true" />
        </a>
      </li>)}
    </ul> : null}
    {!links.length ? <p className={styles.lede}>Everything about {name} is on the website.</p> : null}
    <p className={styles.footnote}><Link href="/" className={styles.text}>Visit the {name} website</Link></p>
  </section>;
}
