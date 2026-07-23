import Link from "next/link";

/**
 * Public / marketing-context 404. On-brand and warm (premium dark + sage +
 * serif display), not a bare zinc numeral. The dashboard-context 404 lives in
 * src/app/dashboard/not-found.tsx and keeps an authenticated owner inside the app.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface-base px-6">
      {/* soft sage glow, low and off-center — warmth without noise */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }}
      />
      <div className="relative w-full max-w-md text-center">
        <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-faint">
          404 · Page not found
        </p>
        <h1 className="font-display text-[34px] leading-[1.1] tracking-[-0.01em] text-warm-white sm:text-[40px]">
          This page wandered off.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-gray-muted">
          The link may be old or mistyped. Let&apos;s get you back to something that works.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          Back to Strelva
        </Link>
      </div>
    </div>
  );
}
