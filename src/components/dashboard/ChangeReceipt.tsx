"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Undo2, User, Bot, Link, Cog } from "lucide-react";
import type { SiteOperation, OperationSource, OperationSurface } from "@/lib/types";

const SOURCE_LABELS: Record<OperationSource, { icon: React.ReactNode; label: string }> = {
  user: { icon: <User className="w-3 h-3" />, label: "You" },
  agent: { icon: <Bot className="w-3 h-3" />, label: "AI Agent" },
  integration: { icon: <Link className="w-3 h-3" />, label: "Integration" },
  system: { icon: <Cog className="w-3 h-3" />, label: "System" },
};

const SURFACE_LABELS: Record<OperationSurface, string> = {
  site: "site content",
  assets: "assets",
  sources: "data sources",
  review: "review",
  newsletter: "newsletter",
  social: "social post",
};

interface ChangeReceiptProps {
  operation: SiteOperation;
  onUndo?: (id: string) => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function ChangeReceipt({
  operation,
  onUndo,
  onDismiss,
  autoDismissMs = 6000,
}: ChangeReceiptProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  const sourceInfo = SOURCE_LABELS[operation.source];
  const surfaceLabel = SURFACE_LABELS[operation.surface];

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(onDismiss, 200); // Wait for animation
  }, [onDismiss]);

  const handleUndo = useCallback(() => {
    if (onUndo) {
      onUndo(operation.id);
    }
    handleDismiss();
  }, [onUndo, operation.id, handleDismiss]);

  useEffect(() => {
    if (autoDismissMs <= 0) return;

    const startTime = Date.now();
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / autoDismissMs) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(intervalId);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, [autoDismissMs, handleDismiss]);

  return (
    <div
      className={`change-receipt fixed bottom-4 right-4 z-50 max-w-sm w-full transition-all duration-200 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="bg-glass border border-glass-border rounded-xl shadow-lg overflow-hidden">
        {/* Progress bar */}
        {autoDismissMs > 0 && (
          <div className="h-0.5 bg-glass-active">
            <div
              className="h-full bg-success transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Status icon */}
            <div className="w-8 h-8 rounded-lg bg-success-dim text-success flex items-center justify-center shrink-0">
              <Check className="w-4 h-4" strokeWidth={2} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-medium text-warm-black leading-snug">
                {operation.title}
              </h4>
              <p className="text-[11px] text-gray-muted mt-0.5 flex items-center gap-1">
                {sourceInfo.icon}
                <span>
                  {sourceInfo.label} updated {surfaceLabel}
                </span>
              </p>
              {operation.description && (
                <p className="text-[11px] text-gray-fg mt-1 line-clamp-1">
                  {operation.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {onUndo && operation.before !== undefined && (
                <button
                  onClick={handleUndo}
                  className="w-8 h-8 rounded-lg bg-glass-active text-gray-muted hover:text-gray-fg hover:bg-gray-bg flex items-center justify-center transition-colors"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="w-8 h-8 rounded-lg text-gray-muted hover:text-gray-fg flex items-center justify-center transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Manager component to handle multiple receipts
interface ReceiptManagerState {
  receipts: Array<{ operation: SiteOperation; key: string }>;
}

export function useChangeReceipts() {
  const [state, setState] = useState<ReceiptManagerState>({ receipts: [] });

  const showReceipt = useCallback((operation: SiteOperation) => {
    const key = `${operation.id}-${Date.now()}`;
    setState((prev) => ({
      receipts: [...prev.receipts.slice(-2), { operation, key }], // Keep max 3
    }));
  }, []);

  const dismissReceipt = useCallback((key: string) => {
    setState((prev) => ({
      receipts: prev.receipts.filter((r) => r.key !== key),
    }));
  }, []);

  return { receipts: state.receipts, showReceipt, dismissReceipt };
}

interface ChangeReceiptsProps {
  receipts: Array<{ operation: SiteOperation; key: string }>;
  onUndo?: (id: string) => void;
  onDismiss: (key: string) => void;
}

export function ChangeReceipts({ receipts, onUndo, onDismiss }: ChangeReceiptsProps) {
  return (
    <div className="change-receipts-container fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {receipts.map(({ operation, key }, index) => (
        <div
          key={key}
          style={{
            transform: `translateY(${(receipts.length - 1 - index) * -4}px)`,
            zIndex: index,
          }}
        >
          <ChangeReceipt
            operation={operation}
            onUndo={onUndo}
            onDismiss={() => onDismiss(key)}
          />
        </div>
      ))}
    </div>
  );
}
