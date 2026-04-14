import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";

export default function BookingsLoading() {
  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-4xl mx-auto h-full overflow-y-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <SkeletonLine width="w-32" height="h-7" />
        <SkeletonLine width="w-56" height="h-4" className="mt-2" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>

      {/* Tab bar placeholder */}
      <div className="flex gap-2 mb-6">
        <SkeletonLine width="w-20" height="h-8" className="rounded-md" />
        <SkeletonLine width="w-16" height="h-8" className="rounded-md" />
        <SkeletonLine width="w-14" height="h-8" className="rounded-md" />
      </div>

      {/* Booking rows */}
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-surface rounded-2xl p-4 flex items-center gap-4"
          >
            <SkeletonLine width="w-12" height="h-12" className="rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonLine width="w-40" height="h-3" />
              <SkeletonLine width="w-56" height="h-2.5" />
            </div>
            <SkeletonLine width="w-16" height="h-5" className="rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
