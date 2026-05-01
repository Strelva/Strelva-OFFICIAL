"use client";

import { CheckCircle } from "lucide-react";

export function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-glass-border bg-glass px-6 py-14 text-center">
      <div className="w-11 h-11 rounded-xl bg-success-dim flex items-center justify-center mb-4">
        <CheckCircle className="w-5 h-5 text-success" />
      </div>
      <p className="text-[14px] font-medium text-white">
        The AI is managing your site
      </p>
      <p className="text-[13px] text-gray-muted mt-1">
        Nothing needs your attention right now.
      </p>
    </div>
  );
}
