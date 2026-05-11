"use client";

import { CheckCircle } from "lucide-react";

export function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-glass-border bg-glass px-6 py-14 text-center">
      <div className="w-11 h-11 rounded-xl bg-success-dim flex items-center justify-center mb-4">
        <CheckCircle className="w-5 h-5 text-success" />
      </div>
      <p className="text-[14px] font-medium text-white">
        Nothing is waiting on approval
      </p>
      <p className="text-[13px] text-gray-muted mt-1">
        Risky AI changes, drafts, and review-needed updates appear here before going live.
      </p>
      <div className="mt-5 grid w-full max-w-xl gap-2 sm:grid-cols-3">
        {["New offer copy", "Review replies", "Large section rewrites"].map((item) => (
          <div
            key={item}
            className="rounded-lg border border-glass-border bg-surface-raised px-3 py-2 text-[11px] text-gray-muted"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
