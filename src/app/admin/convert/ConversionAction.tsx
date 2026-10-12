"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StNotice, StPill, StTextButton } from "@/components/ui/strelva/Kit";
import type { ConversionReceipt, TenantUnlinkReceipt } from "@/platform/business-record";

export type ConversionActionResult = { ok: true; receipt: ConversionReceipt | TenantUnlinkReceipt } | { ok: false; message: string };
export function ConversionAction({ action, label, disabledReason }: { action: () => Promise<ConversionActionResult>; label: string; disabledReason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<ConversionActionResult | null>(null);
  const [unknown, setUnknown] = useState(false);
  async function run() {
    setBusy(true);
    try { setOutcome(await action()); } catch { setUnknown(true); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-4">
    {!outcome && !unknown && <>
      {confirmed && <StNotice tone="need">This changes the saved workspace records and agency access shown in this review. Confirm only after reviewing the source and destination.</StNotice>}
      <div className="flex flex-wrap gap-3"><StPill disabled={busy || Boolean(disabledReason)} busy={busy} onClick={() => confirmed ? void run() : setConfirmed(true)}>{confirmed ? `Confirm ${label.toLowerCase()}` : label}</StPill>{confirmed && !busy && <StTextButton onClick={() => setConfirmed(false)}>Not yet</StTextButton>}</div>
    </>}
    {disabledReason && <StNotice>{disabledReason}</StNotice>}
    {unknown && <StNotice tone="critical">Outcome not confirmed. The response was lost. Read the saved state before deciding what to do next. <StTextButton onClick={() => router.refresh()}>Read saved state</StTextButton></StNotice>}
    {outcome?.ok === false && <StNotice tone="critical">{outcome.message} <StTextButton onClick={() => router.refresh()}>Read saved state</StTextButton></StNotice>}
    {outcome?.ok && <StNotice>{outcome.receipt.kind === "tenant_conversion" ? `${outcome.receipt.alreadyConverted ? "Already converted" : "Converted"}: ${outcome.receipt.workspaceName} · Release ${outcome.receipt.revision}` : `${outcome.receipt.alreadyUnlinked ? "Already undone" : "Conversion undone"}: ${outcome.receipt.workspaceName}. ${outcome.receipt.workspaceDeleted ? "The conversion-created workspace was removed." : "The workspace and changed records were kept."}`} <StTextButton onClick={() => router.refresh()}>Read receipt and Undo eligibility</StTextButton></StNotice>}
  </div>;
}
