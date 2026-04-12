import { SkeletonLine } from "@/components/ui/Skeleton";

export default function SocialLoading() {
  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto space-y-4">
      <SkeletonLine width="w-48" height="h-8" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonLine width="w-full" height="h-20" />
        <SkeletonLine width="w-full" height="h-20" />
        <SkeletonLine width="w-full" height="h-20" />
      </div>
      <SkeletonLine width="w-64" height="h-10" />
      <div className="space-y-2">
        <SkeletonLine width="w-full" height="h-20" />
        <SkeletonLine width="w-full" height="h-20" />
        <SkeletonLine width="w-full" height="h-20" />
      </div>
    </div>
  );
}
