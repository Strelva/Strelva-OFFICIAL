"use client";

import { useState } from "react";

interface ClearSmsButtonProps {
  tenantId: string;
  onCleared?: () => void;
}

export function ClearSmsButton({ tenantId }: ClearSmsButtonProps) {
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/admin/ops/clear-stale-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data: { cleared?: boolean; reason?: string; error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        setStep("error");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error");
      setStep("error");
    }
  }

  if (step === "done") {
    return <span className="text-xs text-positive">Cleared</span>;
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
        <span className="text-xs text-warning">Confirm?</span>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs font-medium text-critical hover:underline"
        >
          Yes, clear
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
      className="text-xs text-gray-faint hover:text-warning disabled:opacity-40 transition-colors"
    >
      {step === "loading" ? "Clearing…" : "Clear"}
    </button>
  );
}
