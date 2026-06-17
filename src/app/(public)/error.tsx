"use client";

import { useEffect } from "react";

/**
 * Error boundary for the public client-site render tree. This page is shown to
 * a paying client's own visitors, so it must stay calm and brand-neutral and
 * must NOT leak any internal error detail. Most transient backend errors are
 * already caught upstream (the layout + section renderer fall back to defaults);
 * this is the last-resort net so a render failure degrades to a polite retry
 * rather than the raw framework error screen.
 */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Intentionally do not surface error detail to site visitors.
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-medium text-neutral-900">
          This page is temporarily unavailable
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          We&apos;re having a brief hiccup loading this page. Please try again in a moment.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
