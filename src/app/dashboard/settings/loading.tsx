export default function SettingsLoading() {
  return (
    <div className="p-6 md:p-8 max-w-3xl animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
        <div className="h-7 w-40 bg-zinc-800 rounded mb-2" />
        <div className="h-4 w-64 bg-zinc-800/60 rounded" />
      </div>

      <div className="bg-[#141414] border border-[#262626] rounded-lg">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="px-5 py-4 border-b border-[#1c1c1c] last:border-0">
            <div className="h-2.5 w-20 bg-zinc-800 rounded mb-2" />
            <div className="h-4 w-48 bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
