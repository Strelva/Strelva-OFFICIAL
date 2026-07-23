"use client";

import { CheckCircle, MessageCircle, Pencil, ShieldCheck } from "lucide-react";

export function EmptyQueue() {
  return (
    <div className="flex min-h-[56vh] flex-col items-center justify-center rounded-2xl border border-glass-border bg-glass px-6 py-14 text-center">
      <div className="w-11 h-11 rounded-xl bg-success-dim flex items-center justify-center mb-4">
        <CheckCircle className="w-5 h-5 text-success" />
      </div>
      <p className="text-[14px] font-medium text-white">
        Nothing needs you right now
      </p>
      <p className="text-[13px] text-gray-muted mt-1">
        Drafts and larger updates appear here before they go live. Small safe edits can still be made from the site editor.
      </p>
      <div className="mt-5 grid w-full max-w-xl gap-2 sm:grid-cols-3">
        {[
          { label: "Edit site copy", icon: Pencil },
          { label: "Ask Strelva for an update", icon: MessageCircle },
          { label: "Review larger changes", icon: ShieldCheck },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-glass-border bg-surface-raised px-3 py-2 text-[11px] text-gray-muted"
          >
            <item.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
