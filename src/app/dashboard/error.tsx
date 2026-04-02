"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void error;
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-lg bg-red-600/[0.06] flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-warm-black mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-muted mb-6">
          {error.message || "An unexpected error occurred. Try refreshing the page."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-sage hover:bg-sage-dark text-sm text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-md bg-white border border-gray-border text-sm text-gray-fg hover:text-warm-black transition-colors"
          >
            Go to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
