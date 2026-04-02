"use client";

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (message: string, opts?: { variant?: ToastVariant; duration?: number; action?: ToastItem["action"] }) => void;
  dismiss: (id: string) => void;
}

/* -------------------------------------------------- */
/*  Context                                            */
/* -------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* -------------------------------------------------- */
/*  Provider + Portal                                  */
/* -------------------------------------------------- */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, opts?: { variant?: ToastVariant; duration?: number; action?: ToastItem["action"] }) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const item: ToastItem = {
        id,
        message,
        variant: opts?.variant ?? "success",
        duration: opts?.duration ?? 4000,
        action: opts?.action,
      };
      setToasts((prev) => [...prev, item]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
            {toasts.map((t) => (
              <ToastBubble key={t.id} item={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------- */
/*  Toast Bubble                                       */
/* -------------------------------------------------- */

const variantIcon: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="w-[14px] h-[14px] text-emerald-500 shrink-0" strokeWidth={1.5} />,
  error: <AlertCircle className="w-[14px] h-[14px] text-red-500 shrink-0" strokeWidth={1.5} />,
  info: <Info className="w-[14px] h-[14px] text-sage shrink-0" strokeWidth={1.5} />,
};

const variantBorder: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50",
  error: "border-red-200 bg-red-50",
  info: "border-gray-border bg-white",
};

function ToastBubble({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-lg animate-toast text-[13px]",
        variantBorder[item.variant],
      )}
    >
      {variantIcon[item.variant]}
      <span className={cn(
        item.variant === "success" && "text-emerald-700",
        item.variant === "error" && "text-red-600",
        item.variant === "info" && "text-warm-black",
      )}>
        {item.message}
      </span>
      {item.action && (
        <button
          onClick={item.action.onClick}
          className="text-[11px] font-medium text-sage hover:text-sage-dark ml-1 transition-colors"
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(item.id)}
        className="ml-1 text-gray-subtle hover:text-gray-muted transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}
