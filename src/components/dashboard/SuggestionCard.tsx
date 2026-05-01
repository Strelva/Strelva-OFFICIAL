"use client";

import { Check, Sparkles, X } from "lucide-react";
import type { UnifiedEvent } from "@/lib/types";

interface SuggestionCardProps {
  event: UnifiedEvent;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  disabled?: boolean;
}

export function SuggestionCard({
  event,
  onApprove,
  onDismiss,
  disabled,
}: SuggestionCardProps) {
  return (
    <div className={`rounded-xl border border-accent/20 bg-accent-dim/35 p-4 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-accent uppercase tracking-wide">
            AI suggestion
          </p>
          <h3 className="text-[14px] font-medium text-warm-black leading-snug mt-1">
            {event.title}
          </h3>
          {event.body && (
            <p className="text-[12px] text-gray-fg mt-1">
              {event.body}
            </p>
          )}
        </div>
        {event.status === "pending" && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onApprove(event.id)}
              disabled={disabled}
              className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-success-dim text-success hover:bg-success hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
              title="Accept suggestion"
            >
              <Check className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => onDismiss(event.id)}
              disabled={disabled}
              className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-gray-bg text-gray-muted hover:bg-gray-bg-hover hover:text-gray-fg flex items-center justify-center transition-colors disabled:opacity-50"
              title="Dismiss suggestion"
            >
              <X className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
