import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";

export default function ReviewsLoading() {
  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <SkeletonLine width="w-32" height="h-7" />
        <SkeletonLine width="w-64" height="h-4" className="mt-2" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>

      {/* Review cards */}
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-surface border border-gray-border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <SkeletonLine width="w-28" height="h-3.5" />
              <SkeletonLine width="w-14" height="h-4" className="rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonLine width="w-20" height="h-3" />
              <SkeletonLine width="w-24" height="h-2.5" />
            </div>
            <SkeletonLine width="w-full" height="h-3" />
            <SkeletonLine width="w-3/4" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
