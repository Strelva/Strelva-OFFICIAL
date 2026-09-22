"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LayoutTemplate, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { APPLICATION_TEMPLATES, type ApplicationTemplate } from "@/products/applications/templates";
import { ApplicationDraftPreview } from "@/experience/applications/ApplicationDraftPreview";
import styles from "./workspace-templates.module.css";

export function WorkspaceTemplateLibrary({ onUse, readOnly = false, available = true, unavailableReason, selectedId, onSelect }: {
  onUse: (template: ApplicationTemplate) => void;
  readOnly?: boolean;
  available?: boolean;
  unavailableReason?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const selected = APPLICATION_TEMPLATES.find(entry => entry.id === (selectedId === undefined ? localSelection : selectedId));
  const entries = APPLICATION_TEMPLATES.filter(entry => (category === "All" || entry.category === category) && `${entry.name} ${entry.description} ${entry.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  function select(id: string | null) {
    const previous = selected?.id;
    setLocalSelection(id); onSelect?.(id);
    window.requestAnimationFrame(() => id ? headingRef.current?.focus() : previous ? triggers.current.get(previous)?.focus() : undefined);
  }
  const blocked = readOnly || !available;
  return <section className={styles.page} data-workspace-templates>
    {selected ? <>
      <Button variant="ghost" type="button" onClick={() => select(null)} icon={<ArrowLeft size={16} />}>All templates</Button>
      <header className={styles.header}><div><p className={styles.eyebrow}>{selected.category} · App template</p><h1 ref={headingRef} tabIndex={-1}>{selected.name}</h1><p>{selected.description}</p></div><Button type="button" disabled={blocked} onClick={() => onUse(selected)}>Use this template <ArrowRight size={16} /></Button></header>
      <p className={styles.note}>{blocked ? unavailableReason || (readOnly ? "You can preview templates here. Switch to a business you can manage to create an app." : "App creation is not available in this workspace.") : "Starts an editable private draft. Review its fields, run its checks, then choose when to publish and who can use it."}</p>
      <ApplicationDraftPreview key={selected.id} spec={selected.spec} />
    </> : <>
      <header className={styles.header}><div><p className={styles.eyebrow}>A useful starting point</p><h1 ref={headingRef} tabIndex={-1}>Make it yours.</h1><p>Try an app, adjust it for your business, and keep the work in Strelva.</p></div></header>
      <div className={styles.filters}><div className={styles.search}><Search size={18} aria-hidden="true" /><TextInput type="search" aria-label="Search templates" placeholder="Find a template…" value={query} onChange={event => setQuery(event.target.value)} /></div><div className={styles.categories} role="group" aria-label="Template category">{["All", "Team", "Customers", "Operations"].map(value => <Button key={value} type="button" size="sm" variant={category === value ? "secondary" : "ghost"} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</Button>)}</div></div>
      <p className={styles.note} role="status">{entries.length} {entries.length === 1 ? "template" : "templates"}{query.trim() ? ` matching “${query.trim()}”` : ""}</p>
      <ul className={styles.grid}>{entries.map(entry => <li key={entry.id}><button ref={element => { if (element) triggers.current.set(entry.id, element); else triggers.current.delete(entry.id); }} type="button" className={styles.template} onClick={() => select(entry.id)} aria-label={`Preview ${entry.name}`}><div className={styles.specimen} aria-hidden="true"><div className={styles.specimenTitle}><LayoutTemplate size={18} />{entry.name}</div>{entry.spec.fields.slice(0, 3).map(field => <div className={styles.specimenField} key={field.id}><span>{field.label}</span><div>{field.type === "select" ? "Choose an option" : field.type === "date" ? "Select a date" : ""}</div></div>)}</div><div className={styles.description}><span className={styles.eyebrow}>{entry.category}</span><h2>{entry.name}</h2><p>{entry.description}</p><span className={styles.preview}>Try the template <ArrowRight size={16} /></span></div></button></li>)}</ul>
      {!entries.length ? <div className={styles.empty}><h2>No matching templates</h2><p>Try another name or category.</p><Button variant="secondary" type="button" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</Button></div> : null}
      {blocked ? <p className={styles.note}>{unavailableReason || "Templates can be previewed here. Creating an app requires an available product and permission in the selected workspace."}</p> : null}
    </>}
  </section>;
}
