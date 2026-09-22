"use client";

import { ArrowUp, LayoutTemplate } from "lucide-react";
import { useId, type RefObject } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextInput";
import styles from "./workspace-home.module.css";

export function WorkspaceComposer({ value, onChange, onSubmit, disabled = false, busy = false, onTemplates, inputRef, label = "What would you like to work on today?", submitLabel = "Continue with this request" }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  busy?: boolean;
  onTemplates?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  label?: string;
  submitLabel?: string;
}) {
  const hintId = useId();
  return <form className={styles.composer} aria-label="Start new work" onSubmit={event => {
    event.preventDefault();
    if (!disabled && !busy && value.trim()) onSubmit(value.trim());
  }}>
    <TextArea ref={inputRef} aria-label={label} aria-describedby={hintId} placeholder="Tell Strelva what your business needs…" value={value} maxLength={3000} rows={3} required disabled={disabled || busy} className={styles.composerInput} onChange={event => onChange(event.target.value)} onKeyDown={event => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
      const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      if (touch && !event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      if (value.trim() && !disabled && !busy) event.currentTarget.form?.requestSubmit();
    }} />
    <div className={styles.composerFooter}>
      {onTemplates ? <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={onTemplates} icon={<LayoutTemplate size={16} />}>Use a template</Button> : <span id={hintId} className={styles.hint}>Shift + Enter for a new line</span>}
      {onTemplates ? <span id={hintId} className={styles.hint}>Shift + Enter for a new line</span> : null}
      <IconButton label={submitLabel} type="submit" disabled={disabled || !value.trim()} loading={busy}><ArrowUp size={20} /></IconButton>
    </div>
  </form>;
}
