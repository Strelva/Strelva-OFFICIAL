import { XaButtonLink, XaHeadline, XaPebbleScene } from "@/components/ui/strelva/Xa";
import styles from "./money.module.css";

/** A money read that failed: Pebble in frame, what still works, one way forward. */
export function MoneyLoadFailure({ title, quiet, retryHref, retryLabel = "Try again" }: { title: string; quiet: string; retryHref?: string; retryLabel?: string }) {
  return <section className={styles.section} aria-labelledby="money-failure" role="alert">
    <XaPebbleScene pose="fixing" size={180} label="Pebble checking the record" />
    <XaHeadline as="h2" size="sm" id="money-failure" quiet={quiet}>{title}</XaHeadline>
    {retryHref ? <div className={styles.actions}><XaButtonLink href={retryHref}>{retryLabel}</XaButtonLink></div> : null}
  </section>;
}
