import Link from "next/link";

/** Admin-context 404. An invalid /admin/* path (e.g. a stale client id) must land
 *  the operator on a dark in-console boundary, NOT be ejected onto the light
 *  marketing 404 — a hard theme flip reads like leaving the product. Mirrors the
 *  dashboard not-found treatment (serif + sage on the dark canvas). */
export default function AdminNotFound() {
  return (
    <div
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface-base px-6"
      data-dashboard
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-[0.05] blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }}
      />
      <div className="relative w-full max-w-md text-center">
        <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-faint">
          Not found
        </p>
        <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-warm-black sm:text-[38px]">
          That page isn&apos;t here.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-gray-muted">
          The client or page may have been removed, or the link is out of date.
        </p>
        <Link
          href="/admin/clients"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          Back to Clients
        </Link>
      </div>
    </div>
  );
}
