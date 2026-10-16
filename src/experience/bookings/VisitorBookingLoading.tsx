import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";

/** The booking's shape while the page reads it. Nothing is changed by opening this page. */
export function VisitorBookingLoading() {
  return <VisitorBookingShell reading>
    <div className={`${styles.page} ${styles.loading}`}>
      <h1 className={styles.title}>Reading your booking</h1>
      <p className={styles.intro} role="status">Opening this page doesn&apos;t change anything.</p>
      <section className={styles.appointment} aria-hidden="true">
        <span className={styles.skeleton} data-size="sm" />
        <span className={styles.skeleton} data-size="lg" />
        <span className={styles.skeleton} data-size="md" />
      </section>
    </div>
  </VisitorBookingShell>;
}
