"use client";

import { CornerDownLeft, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { XaIconButton, XaKbd, XaSays } from "@/components/ui/strelva/Xa";
import { searchWorkspaceItems, type WorkspaceSearchItem } from "./workspace-search";
import styles from "./workspace-search.module.css";

export function WorkspaceSearchDialog({ open, items, scopeName, storageKey, onClose, systemsReleased = false }: { storageKey?: string; open: boolean; items: readonly WorkspaceSearchItem[]; scopeName: string; onClose: () => void; systemsReleased?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (!storageKey) return;
    const frame = window.requestAnimationFrame(() => {
      try { setQuery((window.sessionStorage.getItem(storageKey) || "").slice(0, 3000)); }
      catch { /* Search stays usable without browser storage. */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);
  const id = useId();
  const results = useMemo(() => searchWorkspaceItems(items, query), [items, query]);
  const activeIndex = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) {
      element.close();
      trigger.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id, open]);

  function choose(item: WorkspaceSearchItem) {
    onClose();
    if (item.onOpen) item.onOpen();
    else window.location.assign(item.href);
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.content}>
      <header className={styles.header}>
        <Search size={20} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={`${id}-query`}>Search {scopeName}</label>
        <input ref={input} id={`${id}-query`} placeholder={`Search ${scopeName}`} maxLength={3000} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); if (storageKey) { try { window.sessionStorage.setItem(storageKey, event.target.value); } catch { /* Keep the query in this dialog. */ } } }} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={results.length ? `${id}-result-${activeIndex}` : undefined} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSelected(results.length ? (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
          }
          if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
        }} />
        <button type="button" className={styles.desktopEscape} aria-label="Close search" onClick={onClose}><XaKbd>Esc</XaKbd></button><span className={styles.phoneClose}><XaIconButton label="Close search" tone="plain" onClick={onClose}><X size={18} aria-hidden="true" /></XaIconButton></span>
      </header>
      <div className={styles.meta}><h2 id={`${id}-title`}>{query ? `In ${scopeName}` : `Everything in ${scopeName}`}</h2><span role="status" aria-live="polite" className={styles.count}>{results.length} {results.length === 1 ? "result" : "results"}</span></div>
      <div id={`${id}-results`} role="listbox" aria-label="Search results" className={styles.results}>
        {results.map((item, index) => <button key={item.id} id={`${id}-result-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex} className={styles.result} onMouseMove={() => setSelected(index)} onClick={() => choose(item)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className={styles.resultEnd} aria-hidden="true">{index === activeIndex ? <span className={styles.openHint}>Open<CornerDownLeft size={14} /></span> : null}</span></button>)}
      </div>
      {!results.length ? <div className={styles.empty}><XaSays>{query ? <>Nothing in {scopeName} matches “{query.trim().slice(0, 60)}”. Try one word from its name.</> : systemsReleased ? <>Nothing saved yet. Your Systems, documents and files show up here as they’re made.</> : <>Nothing saved yet. Your Apps, documents and work show up here as they’re made.</>}</XaSays></div> : null}
      <footer className={styles.footer}><span><XaKbd>↑</XaKbd><XaKbd>↓</XaKbd> Choose</span><span><XaKbd>↵</XaKbd> Open</span><span><XaKbd>Esc</XaKbd> Close</span></footer>
    </div>
  </dialog>;
}
