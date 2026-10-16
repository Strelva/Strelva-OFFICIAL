"use client";
import { XaBlock, XaButton, XaDecision, XaField, XaFold, XaHeadline, XaNote, XaObjectPage, XaStatus, XaTextArea, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";

import { STATE_LABELS } from "@/platform/presentation/place-labels";
import { actorPresentation } from "@/platform/presentation/actor";

import { intentRequestFor, useWorkspaceIntent } from "./WorkspaceIntent";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./document-experience.module.css";
import { WorkPlanExperience } from "./WorkPlanExperience";
import type { WorkspaceWork } from "./contracts";
import { documentHistoryPageSchema, type DocumentHistoryPage, type DocumentReceipt, type WorkspaceDocument } from "@/products/documents/contracts";

export type DocumentSaved = { workId: string; workspaceId: string; document: WorkspaceDocument; historyEnabled?: boolean };
export type DocumentTransport = {
  mode: "server" | "local-preview";
  read(workId: string, signal: AbortSignal): Promise<DocumentSaved>;
  write(body: Record<string, unknown>): Promise<DocumentSaved>;
  history?(workId: string, beforeRevision: number, signal: AbortSignal): Promise<DocumentHistoryPage>;
};
const serverTransport: DocumentTransport = {
  mode: "server",
  async read(workId, signal) {
    const response = await fetch(`/api/documents?workId=${encodeURIComponent(workId)}`, { signal, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The document could not be loaded.");
    return body;
  },
  async write(input) {
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The change could not be saved.");
    return body;
  },
  async history(workId, beforeRevision, signal) {
    const params = new URLSearchParams({ workId, beforeRevision: String(beforeRevision) });
    const response = await fetch(`/api/documents/history?${params}`, { signal, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Document history could not be loaded.");
    return documentHistoryPageSchema.parse(body);
  },
};
type Props = { workspaceId: string; workId?: string; readOnly?: boolean; onSaved?: (workId: string) => void; transport?: DocumentTransport; initialRequestText?: string; sources?: readonly WorkspaceWork[]; context?: ReactNode; receiptLabel?: (receipt: DocumentReceipt) => ReactNode; receiptActor?: (receipt: DocumentReceipt) => ReactNode; releaseLabel?: string };

export function DocumentExperience(props: Props) {
  const intent = useWorkspaceIntent();
  if (!props.workId && !props.initialRequestText && !intent.ready) return <p role="status">Opening your request…</p>;
  const onSaved = props.onSaved && !props.workId ? (id: string) => { intent.spend("document"); props.onSaved?.(id); } : props.onSaved;
  return <DocumentSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} onSaved={onSaved} initialRequestText={props.initialRequestText || (!props.workId ? intentRequestFor(intent, "document") : undefined)} />;
}

function DocumentSession({ workspaceId, workId, readOnly, onSaved, transport = serverTransport, initialRequestText, sources = [], context, receiptLabel, receiptActor, releaseLabel }: Props) {
  const [saved, setSaved] = useState<DocumentSaved | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!workId) return;
    const controller = new AbortController();
    transport.read(workId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setSaved(result); setTitle(result.document.title); setText(result.document.text);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The document could not be loaded."); });
    return () => controller.abort();
  }, [workId, transport]);

  async function save(undo = false) {
    if (readOnly || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await transport.write(saved ? { action: "command", workId: saved.workId, command: undo
        ? { kind: "undo", expectedRevision: saved.document.revision, targetRevision: saved.document.revision }
        : { kind: "edit", expectedRevision: saved.document.revision, title, text } }
        : { action: "create", workspaceId, input: { title, text } });
      setSaved(result); setTitle(result.document.title); setText(result.document.text);
      setMessage(transport.mode === "local-preview" ? "Saved in this preview only. Reloading resets it." : "Document saved privately in your workspace.");
      if (!saved) onSaved?.(result.workId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }
  const dirty = saved ? saved.document.title !== title || saved.document.text !== text : Boolean(title.trim());
  const disabled = Boolean(readOnly || busy || (workId && !saved));
  const head = <XaHeadline quiet={saved ? `Private, never on the website${releaseLabel ? ` · ${releaseLabel}` : ""}.` : "Private. Only people in this business can open it."}>{saved?.document.title ? `${saved.document.title}.` : "A new document."}</XaHeadline>;
  const editor = <form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }} aria-label={saved ? "Edit the document" : "Write the document"}>
    <XaField label="Title" value={title} maxLength={160} required disabled={disabled} onChange={event => { setTitle(event.target.value); }} />
    <XaTextArea label="Text" value={text} rows={14} maxLength={50000} disabled={disabled} onChange={event => { setText(event.target.value); }} />
    <div className={styles.actions}>
      <XaButton type="submit" variant="primary" size="lg" busy={busy} disabled={Boolean(readOnly) || !dirty || !title.trim()}>{saved ? "Save changes" : "Save the document"}</XaButton>
      {saved ? <XaTextLink onClick={() => { setTitle(saved.document.title); setText(saved.document.text); setEditing(false); }}>{dirty ? "Throw away changes" : "Done"}</XaTextLink> : null}
    </div>
  </form>;
  const object = drafting ? null : readOnly || (saved && !editing)
    ? saved ? <XaDecision label={saved.document.title} status={<span className={styles.docTitle}>{saved.document.title}</span>} meta={!readOnly ? <XaTextLink onClick={() => setEditing(true)}>Edit</XaTextLink> : undefined} yes={null}>
      <p className={styles.docText}>{saved.document.text || "Nothing written yet."}</p>
    </XaDecision> : null
    : <XaDecision label={saved ? "Editing" : "New document"} status={<XaStatus kind="draft">{saved ? (dirty ? "Not saved" : "Saved") : "Not saved yet"}</XaStatus>} yes={null}>{editor}</XaDecision>;
  const story = <>
    {error ? <XaNote tone="down" role="alert">{error} {workId ? <XaTextLink onClick={() => location.reload()}>Try again</XaTextLink> : null}</XaNote> : null}
    {message ? <XaNote role="status" tone="done">{message}</XaNote> : null}
    {workId && !saved && !error ? <XaWorking title="Opening the document" steps={[{ id: "read", label: "Reading what's saved", state: "active" }]} /> : null}
    {readOnly ? <XaNote>You can read this. Members of the business make changes.</XaNote> : null}
    {initialRequestText && !saved ? <XaBlock label="What you asked"><p className={styles.docText}>{initialRequestText}</p></XaBlock> : null}
    {!saved && !readOnly && transport.mode === "server" ? <XaNote>{drafting ? <XaTextLink onClick={() => setDrafting(false)}>Write it myself instead</XaTextLink> : <>Or let Strelva write a first draft. <XaTextLink onClick={() => setDrafting(true)}>Draft it with Strelva</XaTextLink></>}</XaNote> : null}
    {drafting ? <WorkPlanExperience workspaceId={workspaceId} initialRequest={initialRequestText || "Draft a private document for my business."} sources={sources} presentation="document" /> : null}
    {saved ? <XaBlock label={STATE_LABELS.history}>
      <DocumentHistory key={`${saved.workId}:${saved.document.revision}`} saved={saved} transport={transport} receiptLabel={receiptLabel} receiptActor={receiptActor} />
      {saved.document.history.at(-1)?.kind === "edit" && !readOnly ? <p className={styles.quiet}>{dirty ? "Save or throw away your changes first, then you can undo the last edit." : <XaTextLink onClick={() => void save(true)}>Undo the last edit</XaTextLink>}</p> : null}
    </XaBlock> : null}
    {saved ? context ? <aside className={styles.context}>{context}</aside> : <XaNote>Anyone in this business can open it.</XaNote> : null}
  </>;
  return <section aria-label="Document" aria-busy={busy}><XaObjectPage phone="object-first" head={head} story={story} object={object ?? undefined} wide /></section>;
}

function DocumentHistory({ saved, transport, receiptLabel, receiptActor }: { saved: DocumentSaved; transport: DocumentTransport; receiptLabel?: (receipt: DocumentReceipt) => ReactNode; receiptActor?: (receipt: DocumentReceipt) => ReactNode }) {
  const [receipts, setReceipts] = useState<DocumentReceipt[]>(() => saved.document.history.slice(-20).reverse());
  const [before, setBefore] = useState<number | null>(() => {
    const oldest = saved.document.history.slice(-20)[0]?.revision ?? saved.document.revision + 1;
    return oldest > 1 ? oldest : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function loadOlder() {
    if (busy || before === null || !transport.history) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError("");
    try {
      const page = documentHistoryPageSchema.parse(await transport.history(saved.workId, before, controller.signal));
      if (controller.signal.aborted) return;
      if (page.workId !== saved.workId || page.workspaceId !== saved.workspaceId
        || page.receipts.some(receipt => receipt.revision >= before)
        || (page.nextBeforeRevision !== null && (page.nextBeforeRevision >= before || page.nextBeforeRevision !== page.receipts.at(-1)?.revision))) {
        throw new Error("Document history could not be confirmed. Try again.");
      }
      setReceipts(current => [...current, ...page.receipts]);
      setBefore(page.nextBeforeRevision);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Document history could not be loaded.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <>
    {!receipts.length ? <XaNote>Started {new Date(saved.document.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. {saved.document.revision === 0 || !saved.historyEnabled ? "No edits yet." : "Earlier changes are below."}</XaNote> : <ol className={styles.history}>{receipts.map(receipt => <li key={receipt.revision} className={styles.historyRow}><span className={styles.release}>Release {receipt.revision}</span><div><p><span className="sr-only">Release {receipt.revision}: </span>{receiptLabel?.(receipt) ?? (receipt.kind === "undo" ? "Undid the previous edit" : "Saved document changes")}</p>{receiptActor?.(receipt) ?? actorPresentation(receipt.actor).name ? <p className="text-xs text-gray-muted">{receiptActor?.(receipt) ?? actorPresentation(receipt.actor).name}</p> : null}<XaFold summary={<>Before and after</>}><p className="mt-2 whitespace-pre-wrap">{receipt.before.title}{"\n"}{receipt.before.text}</p><hr className="my-3 border-gray-border" /><p className="whitespace-pre-wrap">{receipt.after.title}{"\n"}{receipt.after.text}</p></XaFold></div><time className={styles.release} dateTime={receipt.at}>{new Date(receipt.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></li>)}</ol>}
    {saved.historyEnabled && transport.history && before !== null && !busy ? <p><XaTextLink onClick={() => void loadOlder()}>{error ? "Try earlier changes again" : "Show earlier changes"}</XaTextLink></p> : null}
    {busy ? <p role="status" className="text-sm text-gray-muted">Opening earlier changes</p> : null}
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
  </>;
}
