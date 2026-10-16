import { StSkeleton } from "@/components/ui/strelva/Kit";
import styles from "./money.module.css";

/** The shape of a money screen while it reads: a headline, then its answer lines. No spinner wall. */
export function MoneyLoading({ label }: { label: string }) {
  return <div className={styles.screen} aria-busy="true">
    <div className={styles.brief}><StSkeleton width="58%" label={label} /><StSkeleton width="40%" /></div>
    <div className={styles.section}>{[72, 64, 80, 52].map((width, index) => <StSkeleton key={index} width={`${width}%`} />)}</div>
  </div>;
}
