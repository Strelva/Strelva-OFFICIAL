import { SkeletonLine } from "@/components/ui/Skeleton";

export default function DomainsLoading() {
  return (
    <div className="p-6 md:p-8 w-full max-w-screen-2xl mx-auto h-full overflow-y-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <SkeletonLine width="w-28" height="h-7" />
        <SkeletonLine width="w-64" height="h-4" className="mt-2" />
      </div>

      {/* Add domain input row */}
      <div className="flex gap-3 mb-8">
        <SkeletonLine width="w-full" height="h-10" className="rounded-lg max-w-md" />
        <SkeletonLine width="w-24" height="h-10" className="rounded-lg shrink-0" />
      </div>

      {/* Domain rows */}
      <div className="bg-surface border border-gray-border rounded-lg divide-y divide-gray-bg">
        {[1, 2].map((i) => (
          <div key={i} className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SkeletonLine width="w-5" height="h-5" className="rounded shrink-0" />
              <SkeletonLine width="w-48" height="h-3" />
            </div>
            <SkeletonLine width="w-20" height="h-5" className="rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
