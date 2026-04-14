import { SkeletonLine } from "@/components/ui/Skeleton";

export default function RewardsLoading() {
  return (
    <div className="w-full max-w-screen-2xl mx-auto h-full overflow-y-auto p-6 md:p-8 animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <SkeletonLine width="w-16" height="h-3" />
        <SkeletonLine width="w-28" height="h-7" className="mt-2" />
        <SkeletonLine width="w-48" height="h-4" className="mt-2" />
      </div>

      {/* Table skeleton */}
      <div className="bg-surface rounded-2xl">
        {/* Table header */}
        <div className="px-5 py-3 border-b border-gray-border flex gap-8">
          <SkeletonLine width="w-24" height="h-2.5" />
          <SkeletonLine width="w-16" height="h-2.5" />
          <SkeletonLine width="w-20" height="h-2.5" />
          <SkeletonLine width="w-16" height="h-2.5" />
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-5 py-4 border-b border-gray-bg last:border-0 flex gap-8">
            <SkeletonLine width="w-32" height="h-3" />
            <SkeletonLine width="w-12" height="h-3" />
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-16" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
