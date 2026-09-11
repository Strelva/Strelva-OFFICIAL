import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
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
  </main>;
}
