import { SkeletonLine } from "@/components/ui/Skeleton";

export default function PhotosLoading() {
  return (
    <div className="flex flex-1 min-h-0 h-full animate-pulse">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0">
          <div>
            <SkeletonLine width="w-20" height="h-5" />
            <SkeletonLine width="w-32" height="h-3" className="mt-1.5" />
          </div>
          <SkeletonLine width="w-24" height="h-9" className="rounded-lg shrink-0" />
        </div>

        {/* Photo grid */}
        <div className="flex-1 px-6 pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-gray-bg-hover rounded-lg"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
