export default function DashboardLoading() {
  return (
    <div className="flex flex-col h-screen bg-[#fafafa]">
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left panel skeleton */}
        <aside className="w-[320px] border-r border-[#e8e8e8] bg-white animate-pulse">
          <div className="h-9 border-b border-[#e8e8e8] px-4 flex items-center">
            <div className="h-3 w-16 bg-[#f5f5f5] rounded" />
          </div>
          <div className="py-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-9 flex items-center px-3 gap-2">
                <div className="w-[5px] h-[5px] rounded-full bg-[#e8e8e8]" />
                <div className="w-[14px] h-[14px] rounded bg-[#f5f5f5]" />
                <div className="h-3 flex-1 bg-[#f5f5f5] rounded" />
              </div>
            ))}
          </div>
        </aside>

        {/* Center preview skeleton */}
        <main className="flex-1 flex flex-col min-w-0 animate-pulse">
          <div className="h-9 border-b border-[#e8e8e8] bg-white" />
          <div className="flex-1 m-3 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.08)]" />
        </main>

        {/* Right chat skeleton */}
        <aside className="w-[360px] border-l border-[#e8e8e8] bg-white animate-pulse">
          <div className="flex items-center gap-3 px-4 h-12 border-b border-[#e8e8e8]">
            <div className="w-7 h-7 rounded-full bg-[#f5f5f5]" />
            <div className="space-y-1.5">
              <div className="h-3 w-24 bg-[#f5f5f5] rounded" />
              <div className="h-2.5 w-36 bg-[#f5f5f5] rounded" />
            </div>
          </div>
          <div className="flex-1" />
          <div className="p-3">
            <div className="h-[52px] bg-[#f5f5f5] border border-[#e8e8e8] rounded-lg" />
          </div>
        </aside>
      </div>

      {/* Mobile skeleton */}
      <div className="flex md:hidden flex-1 items-center justify-center animate-pulse">
        <div className="w-10 h-10 rounded-lg bg-[#f5f5f5]" />
      </div>
    </div>
  );
}
