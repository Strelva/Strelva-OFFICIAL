import Link from "next/link";

/** Dashboard-context 404. Keeps an authenticated owner inside the app (Back to
 *  dashboard) instead of bouncing them to the marketing homepage, and matches the
 *  dark dashboard theme. */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-base px-6" data-dashboard>
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-6xl font-bold text-warm-black">404</h1>
        <p className="mb-6 text-[14px] leading-relaxed text-gray-muted">
          We couldn&apos;t find that page. It may have moved, or the link might be wrong.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
