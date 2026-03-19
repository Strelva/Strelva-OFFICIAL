export default function DashboardLoading() {
  return (
    <div className="p-6 md:p-8 max-w-5xl animate-pulse">
      {/* Status dot */}
      <div className="flex items-center gap-1.5 mb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
        <div className="h-3 w-8 bg-zinc-800 rounded" />
      </div>

      {/* Greeting */}
      <div className="mb-6">
        <div className="h-7 w-56 bg-zinc-800 rounded mb-2" />
        <div className="h-4 w-72 bg-zinc-800/60 rounded" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#141414] border border-[#262626] rounded-lg p-5">
            <div className="h-3 w-24 bg-zinc-800 rounded mb-4" />
            <div className="h-8 w-12 bg-zinc-800 rounded mb-2" />
            <div className="h-3 w-32 bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Status rows */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4 border-b border-[#262626] last:border-0">
            <div className="h-3 w-24 bg-zinc-800 rounded" />
            <div className="h-3 w-40 bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Activity + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-[#141414] border border-[#262626] rounded-lg p-5">
          <div className="h-3 w-28 bg-zinc-800 rounded mb-6" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3 border-b border-[#1c1c1c] last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              <div className="h-3 flex-1 bg-zinc-800/60 rounded" />
              <div className="h-3 w-14 bg-zinc-800/40 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
          <div className="h-3 w-24 bg-zinc-800 rounded mb-6" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-zinc-800/30 rounded-lg mb-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
