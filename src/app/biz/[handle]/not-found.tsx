import Link from "next/link";
import { XaButtonLink, XaEmpty, XaMark } from "@/components/ui/strelva/Xa";
import styles from "@/experience/product/assistants/assistants.module.css";

/** A /biz address with no published business page. Strelva speaks, so Pebble is in frame. */
export default function BusinessPageNotFound() {
  return <div data-workspace-theme="linen" className={styles.publicRoot}>
    <header className={styles.publicHeader}><Link href="/" aria-label="Strelva home" className={styles.brand}><XaMark size={24} /><span>Strelva</span></Link></header>
    <main className={styles.profile}>
      <XaEmpty pose="alone" title="Page not found" job="Only published business pages are shown here"
        action={<XaButtonLink href="/" variant="primary">Go to Strelva</XaButtonLink>}>
        No published business page lives at this address. The business may have taken it down, or the link may be mistyped.
      </XaEmpty>
    </main>
  </div>;
}
