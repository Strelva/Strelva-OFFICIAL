import Link from "next/link";

/** Dashboard-context 404. Keeps an authenticated owner inside the app (Back to
 *  Today) instead of bouncing them to the marketing homepage. Premium warm
 *  treatment — serif display + sage on the dark dashboard canvas, not a bare
 *  numeral. Also the fallback a plan-gated surface lands on when hit directly. */
export default function DashboardNotFound() {
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
          Page not found
        </p>
        <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-warm-black sm:text-[38px]">
          We couldn&apos;t find that page.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-gray-muted">
          It may have moved, or it isn&apos;t part of your dashboard. Your Today view has
          everything that needs you.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          Back to Today
        </Link>
      </div>
    </div>
  );
}
