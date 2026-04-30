"use client";

export function QueueSkeleton() {
  return (
    <div className="flex flex-col h-full animate-page-enter">
      {/* Header skeleton */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b border-glass-border">
        <div className="h-6 w-20 bg-gray-bg rounded-lg skeleton-shimmer" />
        <div className="h-4 w-48 bg-gray-bg rounded mt-2 skeleton-shimmer" style={{ animationDelay: "50ms" }} />
      </header>

      {/* Tabs skeleton */}
      <div className="shrink-0 px-6 pt-4">
        <div className="flex gap-1 p-1 bg-surface-inset rounded-lg w-fit">
          <div className="h-8 w-24 bg-gray-bg rounded-md skeleton-shimmer" />
          <div className="h-8 w-16 bg-gray-bg rounded-md skeleton-shimmer" style={{ animationDelay: "30ms" }} />
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-border bg-surface-raised p-4 skeleton-shimmer"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-bg shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-32 bg-gray-bg rounded" />
                  <div className="h-3 w-48 bg-gray-bg rounded" />
                </div>
                <div className="h-7 w-20 bg-gray-bg rounded-lg shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
