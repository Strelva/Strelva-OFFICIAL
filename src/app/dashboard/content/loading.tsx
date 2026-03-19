export default function ContentLoading() {
  return (
    <div className="p-6 md:p-8 max-w-5xl animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
        <div className="h-7 w-44 bg-zinc-800 rounded mb-2" />
        <div className="h-4 w-60 bg-zinc-800/60 rounded" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-[#141414] border border-[#262626] rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-zinc-800" />
              <div className="flex-1">
                <div className="h-4 w-20 bg-zinc-800 rounded mb-2" />
                <div className="h-3 w-28 bg-zinc-800/60 rounded mb-2" />
                <div className="h-2.5 w-16 bg-zinc-800/40 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
