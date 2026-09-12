import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { INQUIRY_SHELL_COVERAGE, INQUIRY_SHELL_STATUS } from "@/experience/inquiries/shell-status";
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
      <p className={styles.eyebrow}>SCREEN COVERAGE</p>
      <div className={styles.coverageHeading}>
        <div>
          <h2 id="screen-coverage-title" className="font-display">{INQUIRY_SHELL_COVERAGE.readyShells} of {INQUIRY_SHELL_COVERAGE.totalShells} shells are here.</h2>
          <p>Open every screen below. Rows marked Coming soon already have their UI and first working behavior; the note says what still needs to become general.</p>
        </div>
        <strong>{Math.round((INQUIRY_SHELL_COVERAGE.readyShells / INQUIRY_SHELL_COVERAGE.totalShells) * 100)}% UI shell</strong>
      </div>
      <ol className={styles.coverageList}>
        {INQUIRY_SHELL_STATUS.map((screen, index) => <li key={screen.name}>
          <Link href={screen.href}>
            <span className={styles.coverageNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.coverageCopy}><strong>{screen.name}</strong><small>{screen.detail}</small></span>
            <span className={screen.status === "ready" ? styles.ready : styles.comingSoon}>{screen.status === "ready" ? "Ready" : "Coming soon"}</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </li>)}
      </ol>
      <p className={styles.coverageFoot}>{INQUIRY_SHELL_COVERAGE.completeFirstSlice} screens fully cover the inquiry-first slice. {INQUIRY_SHELL_COVERAGE.comingSoon} show the remaining horizontal expansion clearly.</p>
    </section>
  </main>;
}
