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
    // Error boundary caught — error is displayed in the UI
    void error;
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-lg bg-red-600/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-zinc-400 mb-6">
          {error.message || "An unexpected error occurred. Try refreshing the page."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-sm text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-md bg-[#141414] border border-[#262626] text-sm text-zinc-300 hover:text-white transition-colors"
          >
            Go to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
