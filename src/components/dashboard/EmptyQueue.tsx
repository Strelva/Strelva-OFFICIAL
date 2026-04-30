"use client";

import { CheckCircle } from "lucide-react";

export function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-xl bg-success-dim flex items-center justify-center mb-3">
        <CheckCircle className="w-5 h-5 text-success" />
      </div>
      <p className="text-[14px] font-medium text-white">You're all caught up</p>
      <p className="text-[13px] text-gray-muted mt-1">
        No items need your attention right now
      </p>
    </div>
  );
}
