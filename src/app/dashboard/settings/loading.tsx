// Settings-scoped fallback. Renders inside DashboardShell's <main> so it
// must not introduce its own <main>/h-screen wrapper.
export default function SettingsLoading() {
  return (
    <div className="p-6 md:p-8 max-w-screen-2xl mx-auto w-full animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-16 bg-gray-bg-hover rounded mb-2" />
        <div className="h-7 w-40 bg-gray-bg-hover rounded mb-2" />
        <div className="h-4 w-64 bg-gray-bg rounded" />
      </div>

      <div className="bg-surface border border-gray-border rounded-lg">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="px-5 py-4 border-b border-gray-bg last:border-0">
            <div className="h-2.5 w-20 bg-gray-bg-hover rounded mb-2" />
            <div className="h-4 w-48 bg-gray-bg rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
