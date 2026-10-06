import { Card } from "@/components/ui/Card";
import { SkeletonLine } from "@/components/ui/Skeleton";

/** The bookings views while the store is read: the page's own shape, no spinner. */
export function WorkspaceBookingsLoading() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:px-8 md:py-12 lg:px-12" aria-busy="true">
      <div className="mx-auto max-w-[760px]">
        <SkeletonLine width="w-24" />
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Bookings</p>
        <SkeletonLine width="w-64" height="h-9" className="mt-3" />
        <SkeletonLine width="w-80" className="mt-4" />
        <span className="sr-only" role="status">Loading bookings…</span>
        <Card padding="lg" className="mt-8">
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-t border-gray-border py-4 first:border-t-0">
              <SkeletonLine width="w-32" />
              <SkeletonLine width="w-48" height="h-4" className="mt-2" />
              <SkeletonLine width="w-40" className="mt-2" />
            </div>
          ))}
        </Card>
      </div>
    </main>
  );
}
