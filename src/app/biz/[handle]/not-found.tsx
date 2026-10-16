import Link from "next/link";
import { XaButtonLink, XaMark, XaPebbleScene, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/product/assistants/assistants.module.css";

/**
 * A /biz address with no published business page. Strelva speaks, so Pebble
 * is in frame with a job: holding up the blank page it found here. The way
 * on is finding the business itself, since Strelva keeps no directory.
 */
export default function BusinessPageNotFound() {
  return <div data-workspace-theme="linen" className={styles.publicRoot}>
    <header className={styles.publicHeader}><Link href="/" aria-label="Strelva home" className={styles.brand}><XaMark size={24} /><span>Strelva</span></Link></header>
    <main className={styles.profile}>
      <section className={styles.missing} aria-labelledby="missing-title">
        <XaPebbleScene pose="waving" size={220} bare label="Pebble holding up a blank page" />
        <h1 id="missing-title">No business page here</h1>
        <p>Nothing is published at this address. The business may have taken its page down, or the link may be mistyped.</p>
        <div className={styles.missingActions}>
          <XaButtonLink href="https://www.google.com/maps" variant="primary">Find the business on Google Maps</XaButtonLink>
          <XaTextLink href="/">What is Strelva?</XaTextLink>
        </div>
      </section>
    </main>
  </div>;
}
