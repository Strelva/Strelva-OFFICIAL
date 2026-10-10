"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import {
  BUSINESS_EFFORT_CATEGORIES, BUSINESS_EFFORT_CATEGORY_LABELS, EARLIEST_EFFORT_DATE,
  MAX_EFFORT_MINUTES, MAX_EFFORT_TEXT, type BusinessEffortCategory,
} from "@/platform/business-effort/types";
import { recordBusinessEffortAction } from "./effort-actions";

export interface EffortBusinessOption { id: string; label: string }

/** Log human minutes against one customer business. The entry id is issued once
 *  per entry and kept on failure, so resubmitting after a lost response cannot
 *  record the same work twice. */
export function EffortLogForm({ businesses, today }: { businesses: EffortBusinessOption[]; today: string }) {
  const router = useRouter();
  const fixedBusiness = businesses.length === 1 ? businesses[0] : null;
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const [businessId, setBusinessId] = useState(fixedBusiness?.id ?? "");
  const [minutes, setMinutes] = useState("");
  const [category, setCategory] = useState<BusinessEffortCategory>("delivery");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const minutesNumber = Number(minutes);
  const minutesValid = /^\d+$/.test(minutes) && minutesNumber >= 0 && minutesNumber <= MAX_EFFORT_MINUTES;
  const canSubmit = Boolean(businessId) && minutesValid && Boolean(occurredOn) && !pending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setResult(null);
    startTransition(async () => {
      const response = await recordBusinessEffortAction({
        entryId, businessId, minutes: minutesNumber, category, occurredOn, note: note.trim() || undefined,
      }).catch(() => ({ ok: false, message: "The entry could not be confirmed. Submit again; it will not be counted twice." }));
      setResult(response);
      if (response.ok) {
        setEntryId(crypto.randomUUID());
        setMinutes("");
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3" aria-label="Record human minutes">
      <div className="grid gap-3 sm:grid-cols-2">
        {fixedBusiness ? (
          <p className="text-[12px] leading-5 text-gray-muted sm:col-span-2">
            Business: <span className="font-semibold text-warm-white">{fixedBusiness.label}</span>
          </p>
        ) : (
          <SelectInput
            label="Business"
            value={businessId}
            onChange={(event) => setBusinessId(event.target.value)}
            options={[{ value: "", label: "Choose a business" }, ...businesses.map((b) => ({ value: b.id, label: b.label }))]}
            required
          />
        )}
        <TextInput
          label="Minutes"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value.trim())}
          error={minutes && !minutesValid ? `Enter whole minutes from 0 to ${MAX_EFFORT_MINUTES}.` : undefined}
          helperText="Human time only. Record 0 to confirm no human work for this UTC month; it does not replace other entries."
          required
        />
        <SelectInput
          label="Kind of work"
          value={category}
          onChange={(event) => setCategory(event.target.value as BusinessEffortCategory)}
          options={BUSINESS_EFFORT_CATEGORIES.map((value) => ({ value, label: BUSINESS_EFFORT_CATEGORY_LABELS[value] }))}
        />
        <TextInput
          label="Date (UTC)"
          type="date"
          value={occurredOn}
          min={EARLIEST_EFFORT_DATE}
          max={today}
          onChange={(event) => setOccurredOn(event.target.value)}
          required
        />
        <div className="sm:col-span-2">
          <TextInput
            label="Note (optional)"
            value={note}
            maxLength={MAX_EFFORT_TEXT}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What took human time"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={!canSubmit}>
          Record minutes
        </Button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`text-[12px] leading-5 ${result.ok ? "text-positive" : "text-critical"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
