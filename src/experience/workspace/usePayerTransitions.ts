"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";
import { payerNotice, payerReceipt, payerSnapshot } from "./payer-transition-ui";

/** A command receipt and a read are separate operations. Never retry a write to refresh a view. */
export function usePayerTransitions(workspaceId: string | null) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsRefresh, setNeedsRefresh] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const writing = useRef(false);
  const ready = useRef(false);
  const read = useRef<{ version: number; controller?: AbortController }>({ version: 0 });

  const refresh = useCallback(async (confirmed = false) => {
    const version = ++read.current.version;
    read.current.controller?.abort();
    const controller = new AbortController();
    read.current.controller = controller;
    ready.current = false;
    setLoading(true); setNeedsRefresh(true); setError("");
    try {
      const suffix = workspaceId === null ? "" : `?workspaceId=${encodeURIComponent(workspaceId)}`;
      const response = await fetch(`/api/work-economics/payer-transition${suffix}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Payer history could not be loaded.");
      const snapshot = payerSnapshot(body, workspaceId);
      if (!active.current || version !== read.current.version) return;
      setData(snapshot); setNeedsRefresh(false); ready.current = true;
    } catch (cause) {
      if (!active.current || controller.signal.aborted || version !== read.current.version) return;
      // A failed authority read cannot leave actionable controls from an older view.
      setData(null);
      setError(confirmed
        ? "The change was saved, but updated payer history could not be loaded. Refresh payer history before making another change."
        : cause instanceof Error ? cause.message : "Payer history could not be loaded.");
    } finally {
      if (active.current && version === read.current.version) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    active.current = true;
    const readState = read.current;
    void refresh();
    return () => { active.current = false; ready.current = false; ++readState.version; readState.controller?.abort(); };
  }, [refresh]);

  async function command(body: Record<string, unknown>) {
    // Ref guard also protects two clicks before React commits the disabled state.
    if (writing.current || !ready.current) return;
    writing.current = true; ready.current = false;
    setBusy(true); setNeedsRefresh(true); setError(""); setNotice("");
    const version = ++read.current.version;
    read.current.controller?.abort();
    try {
      const response = await fetch("/api/work-economics/payer-transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!active.current || version !== read.current.version) return;
      if (!response.ok) throw new Error(result.error ?? "The payer change could not be confirmed.");
      const receipt = payerReceipt(result, body, workspaceId);
      setNotice(payerNotice(receipt));
      await refresh(true);
    } catch (cause) {
      if (!active.current || version !== read.current.version) return;
      setError(`${cause instanceof Error ? cause.message : "The payer change could not be confirmed."} Refresh payer history before making another change.`);
    } finally {
      writing.current = false;
      if (active.current) setBusy(false);
    }
  }

  return { data, busy, loading, disabled: busy || loading || needsRefresh, error, notice, refresh, command };
}
