"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Chip } from "../console";
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
    return <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Void</Button>;
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
        <TextInput
          label="Reason for voiding"
          value={reason}
          maxLength={MAX_EFFORT_TEXT}
          onChange={(event) => setReason(event.target.value)}
          error={error ?? undefined}
          required
        />
      </div>
      <Button type="submit" variant="danger" size="sm" loading={pending} disabled={!reason.trim() || pending}>Void entry</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }} disabled={pending}>Cancel</Button>
    </form>
  );
}

/** Recent entries, newest first. Voided entries stay visible with their reason. */
export function EffortEntries({
  entries,
  businessNames,
}: {
  entries: BusinessEffortEntry[];
  businessNames?: Record<string, string>;
}) {
  if (entries.length === 0) {
    return <p className="text-[12px] leading-5 text-gray-muted">No entries recorded yet.</p>;
  }
  return (
    <ul className="divide-y divide-glass-border" aria-label="Recent human-minute entries">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <span className={`font-mono text-[13px] tabular-nums ${entry.void ? "text-gray-faint line-through" : "text-warm-white"}`}>
            {entry.minutes} min
          </span>
          <Chip>{BUSINESS_EFFORT_CATEGORY_LABELS[entry.category]}</Chip>
          <span className="text-[12px] text-gray-muted">{entry.occurredOn}</span>
          {businessNames && (
            <span className="text-[12px] font-semibold text-warm-white">{businessNames[entry.businessId] ?? "Unlisted business"}</span>
          )}
          {entry.note && <span className="min-w-0 flex-1 break-words text-[12px] text-gray-muted">{entry.note}</span>}
          {entry.void ? (
            <span className="w-full text-[12px] text-gray-faint">Voided: {entry.void.reason}</span>
          ) : (
            <div className="ml-auto"><VoidControl entryId={entry.id} /></div>
          )}
        </li>
      ))}
    </ul>
  );
}
