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
