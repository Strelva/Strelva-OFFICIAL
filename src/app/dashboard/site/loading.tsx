import { SkeletonLine } from "@/components/ui/Skeleton";

export default function ContentLoading() {
  return (
    <div className="flex flex-col h-full bg-surface-base animate-pulse">
      {/* Desktop 3-panel skeleton */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Left panel */}
        <aside className="w-[320px] border-r border-gray-border flex flex-col shrink-0 p-4 space-y-3">
          <SkeletonLine width="w-24" height="h-3" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonLine width="w-5" height="h-5" className="rounded shrink-0" />
              <SkeletonLine width="w-full" height="h-3" />
            </div>
          ))}
        </aside>

        {/* Center preview */}
        <main className="flex-1 flex flex-col min-w-0 items-center justify-center">
          <SkeletonLine width="w-3/4" height="h-[60%]" className="rounded-lg max-w-2xl" />
        </main>

        {/* Right panel */}
        <aside className="w-[360px] border-l border-gray-border flex flex-col shrink-0">
          <div className="h-10 border-b border-gray-border flex items-center gap-4 px-4">
            <SkeletonLine width="w-12" height="h-3" />
            <SkeletonLine width="w-16" height="h-3" />
          </div>
          <div className="p-4 space-y-4">
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-full" height="h-8" className="rounded-md" />
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-full" height="h-8" className="rounded-md" />
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-full" height="h-20" className="rounded-md" />
          </div>
        </aside>
      </div>

      {/* Tablet fallback */}
      <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0">
        <div className="h-[45%] border-b border-gray-border flex items-center justify-center">
          <SkeletonLine width="w-3/4" height="h-3/4" className="rounded-lg" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <SkeletonLine width="w-20" height="h-3" />
          <SkeletonLine width="w-full" height="h-8" className="rounded-md" />
          <SkeletonLine width="w-20" height="h-3" />
          <SkeletonLine width="w-full" height="h-8" className="rounded-md" />
        </div>
      </div>

      {/* Mobile fallback */}
      <div className="flex md:hidden flex-1 items-center justify-center px-6">
        <div className="text-center space-y-3">
          <SkeletonLine width="w-48" height="h-5" className="mx-auto" />
          <SkeletonLine width="w-56" height="h-3" className="mx-auto" />
        </div>
      </div>
    </div>
  );
}
