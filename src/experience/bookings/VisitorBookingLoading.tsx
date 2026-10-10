import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
export function VisitorBookingLoading() {
  return <VisitorBookingShell><h1 className={styles.title}>Loading your booking</h1><p className={styles.intro} role="status">Reading the current details. Nothing is changed by opening this page.</p></VisitorBookingShell>;
}
