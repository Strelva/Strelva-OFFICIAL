import { StSkeleton } from "@/components/ui/strelva/Kit";
import { SystemHead } from "@/experience/systems/xa/SystemHead";
import x from "@/experience/systems/xa/system-xa.module.css";

/** The bookings views while the store is read: the page's own shape (XA · S2), with the day rows held open. */
export function WorkspaceBookingsLoading() {
  return <div data-dashboard data-workspace-theme="linen" aria-busy="true"><div className={x.screen}>
    <SystemHead kind="bookings" title="Bookings" line="Reading your bookings…" />
    <div className={x.body} data-side="wide">
      <div className={x.week}>{[0, 1, 2].map(day => <div key={day} className={x.main} style={{ gap: 10 }}>
        <StSkeleton width="18%" label={day === 0 ? "Loading bookings" : undefined} />
        <StSkeleton width="70%" />
        <StSkeleton width="55%" />
      </div>)}</div>
      <div className={x.side}><StSkeleton width="60%" /><StSkeleton /></div>
    </div>
  </div></div>;
}
