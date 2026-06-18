"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScanAllButton() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function scanAll() {
    setScanning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/scan/all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const scanned = data.scanned?.length ?? 0;
      const failed = data.failed?.length ?? 0;
      setResult(`Scanned ${scanned}${failed ? `, ${failed} failed` : ""}`);
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-gray-faint" role="status" aria-live="polite">{result}</span>}
      <button
        onClick={() => void scanAll()}
        disabled={scanning}
        className="rounded-md border border-glass-border px-3 py-1.5 text-xs text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:opacity-40"
      >
        {scanning ? "Scanning all…" : "Scan all sites"}
      </button>
    </div>
  );
}
