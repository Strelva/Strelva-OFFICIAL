"use client";
/**
 * XA composer. Pen: LX · Composer (T4ln9, resting bar), LX · Composer · With
 * a yes (LHF4o), C3 · Composer · Typing (cLOpj), C3 · Composer · System
 * attached (JIgmC), C3 · Scope token (DL93z).
 *
 * Presentation only: the caller owns submission, scope and authority. The
 * composer carries at most one waiting item, the thing that needs the person,
 * so a decision sits beside the place they would type rather than in a banner.
 */
import { useId, type ReactNode, type Ref } from "react";
import { ArrowUp, Loader2, Mic, Plus, X } from "lucide-react";
import { XaPebbleAvatar, XaSystemTile } from "./characters";
import { XaInitial } from "./state";
import styles from "./xa.module.css";

export interface XaWaitingItem {
  /** Who it is from and that it waits, e.g. "Waits for you · from Maya". */
  kicker: ReactNode;
  title: ReactNode;
  /** Whoever acted. Pebble when Strelva prepared it. */
  from?: { name: string; color?: string } | { pebble: true };
  /** The one action, usually <XaButton size="sm">Review</XaButton>. */
  action: ReactNode;
}

export interface XaComposerScope {
  label: string;
  /** What the chip says on a phone, usually the System's name alone. */
  short?: string;
  /** Dot beside the scope: the business or System it speaks to and its state. */
  state?: "live" | "waits" | "draft";
  /** Opens the scope picker. Omit and the chip is a plain label: no dead controls. */
  onPick?: () => void;
  /** Whether the picker is open, for aria-expanded. */
  picking?: boolean;
  /** The id of the picker the chip controls. */
  pickerId?: string;
}

export interface XaComposerSystem { kind: string; name: string; onRemove?: () => void }

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  inputLabel?: string;
  /** Resting bar (T4ln9) unless a waiting item, scope or System makes it a card. */
  waiting?: XaWaitingItem;
  scope?: XaComposerScope;
  system?: XaComposerSystem;
  /** Adds a file or a page. Omit and the plus is not drawn: no dead controls. */
  onAdd?: () => void;
  /** Starts dictation. Omit and the mic is not drawn. */
  onVoice?: () => void;
  disabled?: boolean;
  busy?: boolean;
  maxLength?: number;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Shape override; "card" keeps the bar row even with nothing attached. */
  shape?: "bar" | "card";
}

/** The waiting item docked on top of the composer (LHF4o "Waiting"). */
export function XaWaiting({ item }: { item: XaWaitingItem }) {
  return <div className={styles.waiting}>
    {item.from ? "pebble" in item.from ? <XaPebbleAvatar size={36} /> : <XaInitial name={item.from.name} color={item.from.color} size={36} shape="round" /> : null}
    <div className={styles.waitingText}><p className={styles.waitingKicker}>{item.kicker}</p><p className={styles.waitingTitle}>{item.title}</p></div>
    {item.action}
  </div>;
}

export function XaComposer({ value, onChange, onSubmit, placeholder, inputLabel = "Ask Strelva", waiting, scope, system, onAdd, onVoice, disabled, busy, maxLength, inputRef, shape }: Props) {
  const id = useId();
  const form = shape ?? (waiting || scope || system ? "card" : "bar");
  const canSend = !disabled && !busy && value.trim().length > 0;
  const plus = onAdd ? <button type="button" className={styles.composerPlus} onClick={onAdd} disabled={disabled} aria-label="Add a file or a page"><Plus size={form === "bar" ? 22 : 18} aria-hidden="true" /></button> : null;
  const send = <button type="submit" className={styles.composerSend} disabled={disabled || busy} aria-disabled={!canSend || undefined} aria-label={busy ? "Sending" : value.trim() ? "Send" : "Send (type something first)"}>{busy ? <Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <ArrowUp size={form === "bar" ? 20 : 18} aria-hidden="true" />}</button>;
  const input = <>
    <label htmlFor={id} className={styles.srOnly}>{inputLabel}</label>
    <textarea id={id} ref={inputRef} rows={1} maxLength={maxLength} aria-label={inputLabel} className={styles.composerInput} placeholder={placeholder} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend) event.currentTarget.form?.requestSubmit(); } }} />
  </>;
  return <form className={styles.composer} data-shape={form} aria-busy={busy || undefined} onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(); }}>
    {form === "bar" ? <>{plus}{input}{send}</> : <>
      {waiting ? <XaWaiting item={waiting} /> : null}
      {input}
      <div className={styles.composerBar}>
        {plus}
        {scope ? (() => {
          const words = <>{scope.state ? <span className={styles.dot} data-kind={scope.state} aria-hidden="true" /> : null}<span data-chip-full={scope.short ? "true" : undefined}>{scope.label}</span>{scope.short ? <span data-chip-short="true">{scope.short}</span> : null}</>;
          return scope.onPick
            ? <button type="button" className={styles.chip} data-pick="true" onClick={scope.onPick} disabled={disabled} aria-haspopup="listbox" aria-expanded={scope.picking ?? false} aria-controls={scope.pickerId} aria-label={`Asking about ${scope.label}. Change what this asks about`}>{words}</button>
            : <span className={styles.chip} title={`Asking about ${scope.label}`}>{words}</span>;
        })() : null}
        {system ? <span className={styles.chip} data-system="true"><XaSystemTile kind={system.kind} size={24} /><span>{system.name}</span>{system.onRemove ? <button type="button" className={styles.chipRemove} onClick={system.onRemove} aria-label={`Stop asking about ${system.name}`}><X size={14} aria-hidden="true" /></button> : null}</span> : null}
        <span className={styles.grow} />
        {onVoice ? <button type="button" className={styles.composerMic} onClick={onVoice} disabled={disabled} aria-label="Say it instead"><Mic size={18} aria-hidden="true" /></button> : null}
        {send}
      </div>
    </>}
  </form>;
}
