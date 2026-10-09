"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { CleanupReceipt } from "@/lib/deprovision-cleanup-receipt";
import { cleanupRequest } from "./cleanup-client";

export function CleanupRecovery({ tenantId }: { tenantId: string }) {
  const [receipt, setReceipt] = useState<CleanupReceipt | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">("loading");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    setPhase("loading"); setMessage(null); setReceipt(null);
    try {
      const result = await cleanupRequest(tenantId, undefined, signal);
      if (current !== generation.current) return;
      setReceipt(result); setPhase("ready");
    } catch (error) {
      if (current !== generation.current || signal?.aborted) return;
      setPhase("unavailable"); setMessage(error instanceof Error ? error.message : "Cleanup receipt unavailable.");
    }
  }, [tenantId]);
  useEffect(() => {
    const controller = new AbortController();
    const lifecycle = generation;
    void load(controller.signal);
    return () => { lifecycle.current++; controller.abort(); };
  }, [load]);

  async function retry() {
    if (!receipt || receipt.complete || confirmation !== tenantId || retrying || phase !== "ready") return;
    const current = ++generation.current;
    setRetrying(true); setMessage(null);
    try {
      const updated = await cleanupRequest(tenantId, receipt);
      if (current !== generation.current) return;
      setReceipt(updated);
      setMessage(updated?.complete ? "Cleanup confirmed. This retired slug remains reserved." : "Cleanup is still pending. The receipt has been saved; retry when the remaining stores are available.");
    } catch (error) {
      if (current !== generation.current) return;
      setReceipt(null); setPhase("unavailable");
      setMessage(error instanceof Error ? error.message : "Cleanup was not confirmed. Reload before retrying.");
    } finally { if (current === generation.current) setRetrying(false); }
  }

  return <div className="mx-auto max-w-2xl space-y-6">
    <header className="space-y-2">
      <Link href="/admin/clients" className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2">Back to clients</Link>
      <h1 className="font-display text-3xl text-warm-white">Tenant cleanup</h1>
      <p className="break-all text-base text-gray-muted">{tenantId}</p>
    </header>
    <section aria-label="Cleanup receipt" aria-busy={phase === "loading" || retrying} className="space-y-6 rounded-3xl border border-gray-border bg-surface-base p-6">
      {phase === "loading" && <p role="status" className="text-base text-gray-muted">Loading the current cleanup receipt…</p>}
      {phase === "ready" && !receipt && <p role="status" className="text-base text-gray-muted">No cleanup receipt was found. This does not confirm a purge or permit reuse of the slug.</p>}
      {receipt && <>
        <p role="status" className="text-base text-warm-white">{receipt.complete ? "Cleanup confirmed. This retired slug remains reserved." : "Database removal committed. Cleanup is still pending."}</p>
        <dl className="grid gap-4 text-sm">
          <div><dt className="text-gray-muted">Redis and shared resources</dt><dd className="text-warm-white">{receipt.redisComplete ? "Confirmed" : "Pending"}</dd></div>
          <div><dt className="text-gray-muted">Hosted project removal</dt><dd className="text-warm-white">{receipt.providerComplete ? "Confirmed" : "Pending"}</dd></div>
          <div><dt className="text-gray-muted">Receipt</dt><dd className="break-all text-warm-white">{receipt.id}</dd></div>
        </dl>
        {!receipt.complete && <div className="space-y-4">
          <TextInput label={`Type ${tenantId} to confirm cleanup retry`} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={retrying} autoComplete="off" spellCheck={false} />
          <Button variant="danger" size="lg" onClick={() => void retry()} loading={retrying} disabled={retrying || phase !== "ready" || confirmation !== tenantId}>Retry pending cleanup</Button>
        </div>}
      </>}
      {message && <p role={phase === "unavailable" ? "alert" : "status"} className={`text-sm ${phase === "unavailable" ? "text-critical" : "text-gray-muted"}`}>{message}</p>}
      <Button variant="ghost" size="lg" onClick={() => void load()} disabled={phase === "loading" || retrying}>Reload receipt</Button>
    </section>
  </div>;
}
