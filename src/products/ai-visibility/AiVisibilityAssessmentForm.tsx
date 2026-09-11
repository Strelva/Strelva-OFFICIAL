"use client";

import { FileSearch } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { ScoreInput } from "./contracts";

/**
 * Work returned by the caller after a private assessment has been saved.
 *
 * The form deliberately does not import the workspace contract or know which
 * route performs the save. A workspace or another host supplies the operation
 * through `onSubmit` and receives its own result shape through `onCreated`.
 */
export interface AiVisibilityAssessmentFormProps<TWork = unknown> {
  onSubmit: SubmitAiVisibilityAssessment<TWork>;
  onCreated: (work: TWork) => void;
  onCancel?: () => void;
  initialInput?: ScoreInput;
  /** Request text carried from a broader workspace start; it is context only. */
  initialRequestText?: string | null;
}

/** A named callback type for hosts that want to keep the operation separate. */
export type SubmitAiVisibilityAssessment<TWork> = (
  input: ScoreInput,
) => Promise<TWork>;

/**
 * Product-owned form for starting an AI Visibility assessment from a host
 * workspace. Persistence, authorization, and provider execution stay outside
 * the browser component.
 */
export function AiVisibilityAssessmentForm<TWork = unknown>({
  onSubmit,
  onCreated,
  onCancel,
  initialInput,
  initialRequestText,
}: AiVisibilityAssessmentFormProps<TWork>) {
  const [business, setBusiness] = useState(initialInput?.business || "");
  const [url, setUrl] = useState(initialInput?.url || "");
  const [category, setCategory] = useState(initialInput?.category || "");
  const [location, setLocation] = useState(initialInput?.location || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = business.trim();
    if (!name) {
      setError("Enter a business name.");
      return;
    }

    const cleanUrl = url.trim();
    if (cleanUrl) {
      try {
        new URL(/^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`);
      } catch {
        setError("Enter a valid website address, such as example.com.");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    try {
      const work = await onSubmit({
        business: name,
        url: cleanUrl || undefined,
        category: category.trim() || undefined,
        location: location.trim() || undefined,
      });
      onCreated(work);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assessment couldn’t be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent-text">AI Visibility</p>
      <h1 className="mt-4 max-w-2xl font-display text-[34px] font-medium leading-[1.08] text-warm-black sm:text-[44px]">See what AI can understand about this business.</h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">Create an evidence-backed assessment you can keep private or, from an agency workspace, hand directly to its customer.</p>
      {initialRequestText?.trim() ? <div role="note" className="mt-5 max-w-2xl rounded-xl border border-gray-border bg-surface-inset px-4 py-3"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent-text">From your request</p><p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-warm-black">{initialRequestText.trim()}</p><p className="mt-3 text-[12px] leading-relaxed text-gray-muted">This assessment uses the business details below. Your request stays here as context and does not add checks beyond this assessment.</p></div> : null}
      <form onSubmit={submit} className="mt-9 grid gap-4 sm:grid-cols-2">
        <TextInput label="Business name" required autoFocus autoComplete="organization" value={business} onChange={(event) => setBusiness(event.target.value)} placeholder="Acme Dental" className="min-h-12" />
        <TextInput label="Website" inputMode="url" autoComplete="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com" className="min-h-12" />
        <TextInput label="Category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Dentist" className="min-h-12" />
        <TextInput label="Location" autoComplete="address-level2" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Buffalo, NY" className="min-h-12" />
        {error ? <p role="alert" className="text-[13px] text-critical sm:col-span-2">{error}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="lg" loading={submitting} icon={<FileSearch className="h-4 w-4" />}>Run assessment</Button>
          {onCancel ? <Button type="button" size="lg" variant="ghost" disabled={submitting} onClick={onCancel}>Cancel</Button> : null}
          <span className="text-[11px] text-gray-faint">Saved only after completion</span>
        </div>
      </form>
    </div>
  );
}
