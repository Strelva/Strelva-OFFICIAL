"use client";

import { useState, type FormEvent } from "react";
import { StCopy, StTextField, StHead, StNotice, StPage, StPill, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./answer-check.module.css";
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

  return <StPage>
    <StHead title="Ask Gemini about your business" meta="Save a private check of your website and one Gemini answer when available." />
    {initialRequestText?.trim() ? <StNotice><StCopy>From your request</StCopy><StCopy>{initialRequestText.trim()}</StCopy><StCopy muted>This assessment uses the business details below. Your request stays here as context and does not add checks beyond this assessment.</StCopy></StNotice> : null}
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.details}><StTextField label="Business name" required autoFocus autoComplete="organization" value={business} onChange={event => setBusiness(event.target.value)} /><StTextField label="Website" inputMode="url" autoComplete="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="example.com" /><StTextField label="Category" value={category} onChange={event => setCategory(event.target.value)} /><StTextField label="Location" autoComplete="address-level2" value={location} onChange={event => setLocation(event.target.value)} /></div>
      {error ? <StNotice tone="critical">{error}</StNotice> : null}
      <div className={styles.actions}><StPill type="submit" busy={submitting}>Run assessment</StPill>{onCancel ? <StTextButton disabled={submitting} onClick={onCancel}>Cancel</StTextButton> : null}</div>
      <StCopy muted>Saved only after completion</StCopy>
    </form>
  </StPage>;
}
