"use client";

import { useState } from "react";
import { StState, StTextButton } from "@/components/ui/strelva/Kit";

interface RetryRevalidationButtonProps {
  tenantId: string;
  readOnly?: boolean;
}

export function RetryRevalidationButton({ tenantId, readOnly = false }: RetryRevalidationButtonProps) {
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "done" | "skipped" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (readOnly) return;
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

  if (step === "done") return <span role="status"><StState kind="live">Revalidated</StState></span>;
  if (step === "skipped") return <span role="status"><StState kind="draft">Skipped (no revalidation URL)</StState></span>;
  if (step === "error") return <span role="alert" title={error ?? undefined}><StState kind="down">Failed: {error}</StState></span>;
  if (step === "confirm") return <span className="flex flex-wrap items-center gap-4"><StState kind="need">Re-trigger?</StState><StTextButton tone="accent" onClick={() => void handleRetry()}>Yes, retry</StTextButton><StTextButton onClick={() => setStep("idle")}>Cancel</StTextButton></span>;
  return <StTextButton disabled={readOnly || step === "loading"} onClick={() => setStep("confirm")}>{step === "loading" ? "Retrying…" : "Retry"}</StTextButton>;
}
