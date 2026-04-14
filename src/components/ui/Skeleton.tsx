import { cn } from "@/lib/cn";

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLine({ width = "w-3/4", height = "h-3", className }: SkeletonLineProps) {
  return (
    <div
      className={cn(
        "bg-gray-bg-hover rounded animate-pulse",
        width,
        height,
        className,
      )}
    />
  );
}

interface SkeletonCircleProps {
  size?: string;
  className?: string;
}

export function SkeletonCircle({ size = "w-8 h-8", className }: SkeletonCircleProps) {
  return <div className={cn("rounded-full bg-gray-bg-hover animate-pulse", size, className)} />;
}

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
  return (
    <div className={cn("bg-surface rounded-2xl p-4 space-y-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? "w-1/3" : i === lines - 1 ? "w-1/2" : "w-3/4"} />
      ))}
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 animate-pulse", className)}>
      <SkeletonCircle size="w-5 h-5" />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine width="w-3/4" height="h-2.5" />
        <SkeletonLine width="w-1/2" height="h-2" />
      </div>
    </div>
  );
}
