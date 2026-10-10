import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
import styles from "@/experience/places/workspace-results.module.css";

export default function ResultsLoading() {
  return <main className={styles.paper} data-dashboard data-workspace-theme="linen"><StPage><StHead title="Results and health" meta="Loading visits, searches and the latest site checks." /><StSkeleton label="Loading results" width="65%" /><StSkeleton /><StSkeleton width="80%" /></StPage></main>;
}
