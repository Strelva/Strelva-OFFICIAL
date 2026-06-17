"use client";

/**
 * Last-resort error boundary for the Strelva marketing tree. The marketing
 * pages are largely static, so this rarely fires — it exists so a render
 * failure degrades to a calm retry instead of the raw framework error screen.
 */
export default function MarketingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-medium text-neutral-100">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-400">
          We hit a brief snag loading this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
