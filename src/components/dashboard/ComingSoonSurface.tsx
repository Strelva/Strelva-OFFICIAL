/**
 * Placeholder for a vertical-set surface whose feature is enabled but whose module
 * (the studio operations build) hasn't shipped yet. Prevents an enabled tab from 404ing.
 */
export function ComingSoonSurface({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-lg rounded-xl border border-glass-border bg-glass p-8 text-center">
        <h1 className="text-lg font-medium text-warm-black">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-muted">{description}</p>
        <span className="mt-4 inline-block rounded-full border border-gray-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-faint">
          Coming soon
        </span>
      </div>
    </div>
  );
}
