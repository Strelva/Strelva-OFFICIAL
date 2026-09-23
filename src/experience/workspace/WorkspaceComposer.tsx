"use client";

import { ArrowUp, LayoutGrid } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { readRequestDraft, writeRequestDraft } from "./request-draft";
import styles from "./workspace-composer.module.css";

export interface WorkspaceComposerProps {
  initialRequest?: string;
  draftKey?: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (request: string) => void | Promise<void>;
  onTemplates?: () => void;
  onChange?: (request: string) => void;
  onEdited?: (request: string) => void;
}

export function WorkspaceComposer(props: WorkspaceComposerProps) {
  return <ComposerSession key={`${props.draftKey || "transient"}:${props.initialRequest || ""}`} {...props} />;
}

/** One request editor. Routing, permission and execution remain with its caller. */
function ComposerSession({ initialRequest = "", draftKey, disabled = false, placeholder = "What do you want Strelva to make happen?", autoFocus = false, onSubmit, onTemplates, onChange, onEdited }: WorkspaceComposerProps) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [request, setRequest] = useState(initialRequest);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    // Restore only after hydration. Explicit continuation text always wins.
    if (!draftKey || initialRequest) return;
    try {
      const saved = readRequestDraft(window.sessionStorage, draftKey);
      if (saved) setRequest(saved);
    } catch { /* The editor still works without browser storage. */ }
  }, [draftKey, initialRequest]);

  useEffect(() => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = "auto";
    const minHeight = Number.parseFloat(window.getComputedStyle(input).minHeight) || 0;
    input.style.height = `${Math.min(288, Math.max(minHeight, input.scrollHeight))}px`;
  }, [request]);

  useEffect(() => {
    if (autoFocus) textarea.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function change(value: string) {
    setRequest(value);
    onChange?.(value);
    onEdited?.(value);
    setError("");
    if (!draftKey) return;
    try { setStorageUnavailable(!writeRequestDraft(window.sessionStorage, draftKey, value)); }
    catch { setStorageUnavailable(true); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = request.trim();
    if (!value || disabled || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try { await onSubmit(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That request could not be opened. Your draft is still here."); }
    finally { submitting.current = false; setPending(false); }
  }

  return <div className={styles.wrap}>
    <form className={styles.composer} onSubmit={event => void submit(event)} aria-label="Start new work" aria-busy={pending || undefined}>
      <label className={styles.srOnly} htmlFor={id}>What do you want to accomplish?</label>
      <textarea ref={textarea} id={id} value={request} onChange={event => change(event.target.value)} disabled={disabled || pending} placeholder={placeholder} maxLength={3000} rows={3} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }} />
      <div className={styles.tools}>
        {onTemplates ? <Button type="button" variant="ghost" size="sm" onClick={onTemplates} disabled={pending}><LayoutGrid size={16} aria-hidden="true" />Browse examples</Button> : <span />}
        <div className={styles.send}>
          {request ? <button type="button" className={styles.clear} onClick={() => change("")} disabled={pending}>Clear draft</button> : null}
          <Button type="submit" variant="contrast" size="sm" loading={pending} disabled={disabled || !request.trim()} aria-label="Continue with this request"><ArrowUp size={18} aria-hidden="true" /><span className={styles.srOnly}>Continue</span></Button>
        </div>
      </div>
    </form>
    <p id={`${id}-hint`} className={styles.hint}>{storageUnavailable ? "Browser storage is unavailable. Keep this page open to retain your draft." : "You’ll review what Strelva understood before anything consequential happens."}<span>Enter to continue. Shift + Enter for a new line.</span></p>
    {error ? <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p> : null}
  </div>;
}
