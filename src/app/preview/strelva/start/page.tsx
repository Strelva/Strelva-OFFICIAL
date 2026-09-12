import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { INQUIRY_SHELL_STATUS } from "@/experience/inquiries/shell-status";
import styles from "@/experience/delivery/entry.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore Strelva locally", robots: { index: false, follow: false } };
export default function Page() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main className={styles.page}>
    <Link href="http://localhost:3124" className={styles.back}>← Strelva homepage</Link>
    <p className={styles.eyebrow}>LOCAL REVIEW</p>
    <h1 className="font-display">Your next step starts here.</h1>
    <p className={styles.intro}>Explore the business and agency interfaces. These are sample workspaces; requests and reviews stay in this browser. No account is created and nothing is sent or published.</p>
    <div className={styles.choices}>
      <Link href="/preview/strelva/client"><h2>For your business <span>↗</span></h2><p>Describe what you need, review implementation, and find your live software.</p><strong>Open business interface</strong></Link>
      <Link href="/preview/strelva/agency"><h2>For your agency <span>↗</span></h2><p>Manage client requests and review the work Strelva implements for them.</p><strong>Open agency interface</strong></Link>
    </div>
    <nav aria-label="More interfaces" className={styles.links}>
      <Link href="/preview/strelva">Saved work & products ↗</Link>
      <Link href="/preview/strelva/customers">Customer records ↗</Link>
      <Link href="/preview/strelva/website">Managed website ↗</Link>
    </nav>
    <section className={styles.coverage} aria-labelledby="screen-coverage-title">
      <p className={styles.eyebrow}>INQUIRY EXAMPLES</p>
      <div className={styles.coverageHeading}>
        <div>
          <h2 id="screen-coverage-title" className="font-display">Explore the inquiry journey.</h2>
          <p>These examples show one part of Strelva. Shared screens for other kinds of work are still in progress. Some examples need a request or record before they show their full content.</p>
        </div>
        <strong>Local examples</strong>
      </div>
      <ol className={styles.coverageList}>
        {INQUIRY_SHELL_STATUS.map((screen, index) => <li key={screen.name}>
          <Link href={screen.href}>
            <span className={styles.coverageNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.coverageCopy}><strong>{screen.name}</strong><small>{screen.detail}</small></span>
            <span className={screen.status === "ready" ? styles.ready : styles.comingSoon}>{screen.status === "ready" ? "Inquiry example" : "More coming soon"}</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </li>)}
      </ol>
      <p className={styles.coverageFoot}>This directory shows available examples. It does not measure completion of the horizontal product or its internal research system.</p>
    </section>
  </main>;
}
