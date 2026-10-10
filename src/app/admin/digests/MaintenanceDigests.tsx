"use client";

import { useState } from "react";
import { StCopy, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";

export function MaintenanceDigests({ initialDigests, request = fetch }: { initialDigests: MaintenanceDigest[]; request?: typeof fetch }) {
  const [digests, setDigests] = useState(initialDigests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(tenant: string, decision: "approved" | "dismissed") {
    setBusy(tenant);
    setError("");
    try {
      const res = await request("/api/admin/maintenance-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tenant, decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Couldn't record that.");
        return;
      }
      // Optimistically drop the decided digest from the pending list.
      setDigests((cur) => cur.filter((d) => d.tenant !== tenant));
    } catch {
      setError("Couldn't record that. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  if (digests.length === 0) return <StEmpty><StState kind="live">Nothing needs review</StState><StCopy muted>Maintenance digests are prepared weekly on Mondays. Any proposed upkeep appears here.</StCopy></StEmpty>;

  return <div className="space-y-6">
    {error && <StNotice tone="critical">{error}</StNotice>}
    {digests.map(digest => <StSection key={digest.tenant} title={<StTextButton href={`/admin/clients/${digest.tenant}`}>{digest.siteName || digest.tenant}</StTextButton>} meta={<StMono>{digest.items.length} items · week of {digest.weekOf}</StMono>} action={<div className="flex flex-wrap items-center gap-2"><StPill variant="soft" onClick={() => decide(digest.tenant, "approved")} disabled={busy === digest.tenant} busy={busy === digest.tenant}>Approve</StPill><StTextButton onClick={() => decide(digest.tenant, "dismissed")} disabled={busy === digest.tenant}>Dismiss</StTextButton></div>}>
      <StRows label={`Proposed upkeep for ${digest.siteName || digest.tenant}`}>{digest.items.map(item => <StRow key={item.id} kind={item.type === "health" ? "Site health" : "Content"} title={item.title} detail={item.detail} />)}</StRows>
    </StSection>)}
  </div>;
}
