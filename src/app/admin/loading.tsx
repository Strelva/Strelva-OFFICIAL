export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-48 rounded-md bg-glass animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-glass border border-glass-border animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-glass border border-glass-border animate-pulse" />
    </div>
  );
}
