"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StEmpty, StMono, StRow, StRows, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import {
  BUSINESS_EFFORT_CATEGORY_LABELS, MAX_EFFORT_TEXT, type BusinessEffortEntry,
} from "@/platform/business-effort/types";
import { voidBusinessEffortAction } from "./effort-actions";

function VoidControl({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <StTextButton onClick={() => setOpen(true)}>Void</StTextButton>;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const response = await voidBusinessEffortAction({ entryId, reason: reason.trim() })
        .catch(() => ({ ok: false, message: "The void could not be confirmed. Submit again; it will not be recorded twice." }));
      if (response.ok) router.refresh();
      else setError(response.message);
    });
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-wrap items-end gap-2" aria-label="Void entry">
      <div className="min-w-[200px] flex-1">
        <StTextField
          label="Reason for voiding"
          value={reason}
          maxLength={MAX_EFFORT_TEXT}
          onChange={(event) => setReason(event.target.value)}
          error={error ?? undefined}
          required
        />
      </div>
      <StTextButton type="submit" tone="danger" aria-busy={pending} disabled={!reason.trim() || pending}>Void entry</StTextButton>
      <StTextButton onClick={() => { setOpen(false); setError(null); }} disabled={pending}>Cancel</StTextButton>
    </form>
  );
}

/** Recent entries, newest first. Voided entries stay visible with their reason. */
export function EffortEntries({
  entries,
  businessNames,
  readOnly = false,
}: {
  entries: BusinessEffortEntry[];
  businessNames?: Record<string, string>;
  readOnly?: boolean;
}) {
  if (entries.length === 0) return <StEmpty>No entries recorded yet.</StEmpty>;
  return <StRows label="Recent human-minute entries">{entries.map(entry => <StRow key={entry.id}
    title={businessNames ? businessNames[entry.businessId] ?? "Unlisted business" : BUSINESS_EFFORT_CATEGORY_LABELS[entry.category]}
    kind={businessNames ? BUSINESS_EFFORT_CATEGORY_LABELS[entry.category] : undefined}
    detail={<><StMono>{entry.occurredOn}</StMono>{entry.note ? ` · ${entry.note}` : ""}{entry.void ? <span className="block">Voided: {entry.void.reason}</span> : null}</>}
    end={<><StMono>{entry.void ? <s>{entry.minutes} min</s> : `${entry.minutes} min`}</StMono>{!entry.void && !readOnly ? <VoidControl entryId={entry.id} /> : null}</>} />)}</StRows>;
}
