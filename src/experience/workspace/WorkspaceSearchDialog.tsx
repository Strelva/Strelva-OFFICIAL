"use client";

import { ArrowUpRight, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { searchWorkspaceItems, type WorkspaceSearchItem } from "./workspace-search";
import styles from "./workspace-search.module.css";

export function WorkspaceSearchDialog({ open, items, scopeName, onClose }: { open: boolean; items: readonly WorkspaceSearchItem[]; scopeName: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
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

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.content}>
      <header className={styles.header}>
        <Search size={20} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={`${id}-query`}>Search {scopeName}</label>
        <input ref={input} id={`${id}-query`} placeholder="Search your work…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={results.length ? `${id}-result-${activeIndex}` : undefined} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSelected(results.length ? (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
          }
          if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
        }} />
        <IconButton label="Close search" variant="ghost" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className={styles.meta}><h2 id={`${id}-title`}>{scopeName}</h2><span role="status" aria-live="polite">{results.length} {results.length === 1 ? "result" : "results"}</span></div>
      <div id={`${id}-results`} role="listbox" aria-label="Search results" className={styles.results}>
        {results.map((item, index) => <button key={item.id} id={`${id}-result-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex} className={styles.result} onMouseMove={() => setSelected(index)} onClick={() => choose(item)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>)}
      </div>
      {!results.length ? <div className={styles.empty}><strong>{query ? "No matching work" : "No saved work yet"}</strong><p>{query ? "Try a different name or a shorter search." : "Your saved apps, documents, and work will be searchable here."}</p></div> : null}
      <footer className={styles.footer}>Use ↑ ↓ to choose, Enter to open, and Esc to close.</footer>
    </div>
  </dialog>;
}
