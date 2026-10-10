import styles from "@/experience/enterprise/home-finder-buyer.module.css";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";

export default function LoadingHomeFinder() {
  return <main data-dashboard data-workspace-theme="linen" className={styles.paper}><StPage><StHead title="Opening Home Finder…" /><StSkeleton label="Checking access to Home Finder" /><StSkeleton width="65%" /></StPage></main>;
}
