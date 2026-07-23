"use client";

import { useState } from "react";

interface RetryRevalidationButtonProps {
  tenantId: string;
}

export function RetryRevalidationButton({ tenantId }: RetryRevalidationButtonProps) {
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "done" | "skipped" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/admin/ops/retry-revalidation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data: { success?: boolean; skipped?: boolean; error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        setStep("error");
        return;
      }
      setStep(data.skipped ? "skipped" : "done");
    } catch {
      setError("Network error");
      setStep("error");
    }
  }

  if (step === "done") {
    return <span className="text-xs text-positive">Revalidated</span>;
  }

  if (step === "skipped") {
    return <span className="text-xs text-gray-muted">Skipped (no revalidateUrl)</span>;
  }

  if (step === "error") {
    return (
      <span className="text-xs text-critical" title={error ?? undefined}>
        Failed
      </span>
    );
  }

  if (step === "confirm") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-warning">Re-trigger?</span>
        <button
          type="button"
          onClick={handleRetry}
          className="text-xs font-medium text-accent hover:underline"
        >
          Yes, retry
        </button>
        <button
          type="button"
          onClick={() => setStep("idle")}
          className="text-xs text-gray-muted hover:text-warm-white"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={step === "loading"}
      onClick={() => setStep("confirm")}
      className="text-xs text-gray-faint hover:text-accent disabled:opacity-40 transition-colors"
    >
      {step === "loading" ? "Retrying…" : "Retry"}
    </button>
  );
}
