"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { StNotice, StTextButton } from "@/components/ui/strelva/Kit";
import { XaComposer } from "@/components/ui/strelva/xa/composer";
import { readRequestDraft, writeRequestDraft } from "./request-draft";
import styles from "./workspace-composer.module.css";

export interface WorkspaceComposerProps {
  initialRequest?: string;
  draftKey?: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (ask: string) => void | Promise<void>;
  onTemplates?: () => void;
  onChange?: (ask: string) => void;
  onEdited?: (ask: string) => void;
  /** Compatibility input; the browse label is "Browse Apps" in both release states. */
  systemsReleased?: boolean;
  /** `glass`: the compact frosted composer on Home's dusk band (October 6, 2026). */
  tone?: "default" | "glass" | "dock";
  scope?: string;
}

export function WorkspaceComposer(props: WorkspaceComposerProps) {
  return <ComposerSession key={`${props.draftKey || "transient"}:${props.initialRequest || ""}`} {...props} />;
}

/** One ask editor. Routing, permission and execution remain with its caller. */
function ComposerSession({ initialRequest = "", draftKey, disabled = false, placeholder = "What do you want Strelva to make happen?", autoFocus = false, onSubmit, onTemplates, onChange, onEdited, systemsReleased: _systemsReleased = false, tone = "default", scope }: WorkspaceComposerProps) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [ask, setAsk] = useState(initialRequest);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    // Restore only after hydration. Explicit continuation text always wins.
    if (!draftKey || initialRequest) return;
    try {
      const saved = readRequestDraft(window.sessionStorage, draftKey);
      if (saved) setAsk(saved);
    } catch { /* The editor still works without browser storage. */ }
  }, [draftKey, initialRequest]);

  useEffect(() => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = "auto";
    const minHeight = Number.parseFloat(window.getComputedStyle(input).minHeight) || 0;
    input.style.height = `${Math.min(288, Math.max(minHeight, input.scrollHeight))}px`;
  }, [ask]);

  useEffect(() => {
    if (autoFocus) textarea.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function change(value: string) {
    setAsk(value);
    onChange?.(value);
    onEdited?.(value);
    setError("");
    if (!draftKey) return;
    try { setStorageUnavailable(!writeRequestDraft(window.sessionStorage, draftKey, value)); }
    catch { setStorageUnavailable(true); }
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const value = ask.trim();
    if (!value || disabled || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try { await onSubmit(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That ask could not be opened. Your draft is still here."); }
    finally { submitting.current = false; setPending(false); }
  }

  // One composer product-wide (October 16): every tone draws XaComposer. The
  // tone only decides whether the reassurance line shows under it.
  return <div className={styles.dockWrap} data-tone={tone}>
    <XaComposer inputRef={textarea} scope={scope ? { label: scope } : undefined} placeholder={placeholder} value={ask} onChange={change} onSubmit={() => void submit()} disabled={disabled} busy={pending} maxLength={3000} inputLabel="What do you want to accomplish?" />
    {onTemplates ? <StTextButton disabled={pending} onClick={onTemplates}>{"Browse Apps"}</StTextButton> : null}
    {pending ? <span role="status" className="sr-only">Opening your ask…</span> : null}
    {tone === "default" && !storageUnavailable ? <p id={`${id}-hint`} className={styles.hint}>You’ll review what Strelva understood before anything consequential happens.</p> : null}
    {storageUnavailable ? <StNotice>Browser storage is unavailable. Keep this page open to retain your draft.</StNotice> : null}
    {error ? <div role="alert"><StNotice tone="critical">{error}</StNotice></div> : null}
  </div>;
}
