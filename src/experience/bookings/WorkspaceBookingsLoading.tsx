import { StPage, StHead, StSection, StRows, StRow, StSkeleton } from "@/components/ui/strelva/Kit";

/** The bookings views while the store is read: the page's own shape. */
export function WorkspaceBookingsLoading() {
  return <main data-dashboard data-workspace-theme="linen" aria-busy="true"><StPage>
    <StHead crumb={{ label: "Home" }} title="Bookings" meta="Reading your bookings…" />
    <StSection title={<StSkeleton width="45%" label="Loading bookings" />}>
      <StRows>{[0, 1, 2].map(row => <StRow key={row} title={<StSkeleton width="50%" />} detail={<StSkeleton width="70%" />} />)}</StRows>
    </StSection>
  </StPage></main>;
}
