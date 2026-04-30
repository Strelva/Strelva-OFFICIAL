"use client";

export function BriefSkeleton() {
  return (
    <div className="flex flex-col h-full animate-page-enter">
      {/* Header skeleton */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b border-glass-border">
        <div className="h-6 w-32 bg-gray-bg rounded-lg skeleton-shimmer" />
        <div className="h-4 w-36 bg-gray-bg rounded mt-2 skeleton-shimmer" style={{ animationDelay: "50ms" }} />
      </header>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl space-y-6">
          {/* Summary paragraph skeleton */}
          <div className="space-y-2 skeleton-shimmer" style={{ animationDelay: "80ms" }}>
            <div className="h-4 w-full bg-gray-bg rounded" />
            <div className="h-4 w-5/6 bg-gray-bg rounded" />
            <div className="h-4 w-4/6 bg-gray-bg rounded" />
          </div>

          {/* Stats cards skeleton */}
          <div className="flex flex-col sm:flex-row gap-3 skeleton-shimmer" style={{ animationDelay: "120ms" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex-1 min-w-0 p-4 rounded-xl bg-surface-raised border border-glass-border"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 bg-gray-bg rounded" />
                  <div className="h-3 w-16 bg-gray-bg rounded" />
                </div>
                <div className="h-8 w-12 bg-gray-bg rounded" />
              </div>
            ))}
          </div>

          {/* Highlights skeleton */}
          <div className="skeleton-shimmer" style={{ animationDelay: "160ms" }}>
            <div className="h-3 w-20 bg-gray-bg rounded mb-3" />
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gray-bg mt-2 shrink-0" />
                  <div className="h-4 w-64 bg-gray-bg rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
