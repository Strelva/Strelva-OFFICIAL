"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea } from "@/components/ui/TextInput";
import { WorkPlanExperience } from "./WorkPlanExperience";
import type { WorkspaceWork } from "./contracts";
import type { WorkspaceDocument } from "@/products/documents/contracts";

export type DocumentSaved = { workId: string; workspaceId: string; document: WorkspaceDocument };
export type DocumentTransport = {
  mode: "server" | "local-preview";
  read(workId: string, signal: AbortSignal): Promise<DocumentSaved>;
  write(body: Record<string, unknown>): Promise<DocumentSaved>;
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
};
type Props = { workspaceId: string; workId?: string; readOnly?: boolean; onSaved?: (workId: string) => void; transport?: DocumentTransport; initialRequestText?: string; sources?: readonly WorkspaceWork[] };

export function DocumentExperience(props: Props) {
  return <DocumentSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} />;
}

function DocumentSession({ workspaceId, workId, readOnly, onSaved, transport = serverTransport, initialRequestText, sources = [] }: Props) {
  const [saved, setSaved] = useState<DocumentSaved | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
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
  return <section className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8" aria-label="Workspace document" aria-busy={busy}>
    <header><p className="text-sm text-gray-muted">Private document</p><h1 className="font-display text-2xl">{saved?.document.title ?? "Write something your business can use"}</h1><p className="mt-2 text-sm text-gray-muted">Keep a procedure, proposal, or working note with a history of changes. Saving here does not publish or send it.</p></header>
    {!saved && !readOnly && transport.mode === "server" ? <div className="flex flex-wrap gap-3"><Button type="button" variant={drafting ? "primary" : "secondary"} onClick={() => setDrafting(true)}>Draft with Strelva</Button>{drafting ? <Button type="button" variant="secondary" onClick={() => setDrafting(false)}>Write it myself</Button> : null}</div> : null}
    {drafting ? <WorkPlanExperience workspaceId={workspaceId} initialRequest={initialRequestText || "Draft a private document for my business."} sources={sources} presentation="document" /> : <>
    {initialRequestText && !saved ? <aside className="space-y-2 border-y border-gray-border py-4 text-sm"><h2 className="font-medium">What you asked</h2><p className="whitespace-pre-wrap">{initialRequestText}</p><p className="text-gray-muted">Your request stays with this document. Write below or ask Strelva to prepare a draft.</p></aside> : null}
    {error ? <p role="alert" className="text-critical">{error} {workId ? <button type="button" className="underline" onClick={() => location.reload()}>Reload document</button> : null}</p> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {workId && !saved && !error ? <p role="status">Loading your document…</p> : null}
    {readOnly ? <article className="space-y-4"><p className="text-sm text-gray-muted">You have read-only access.</p><p className="whitespace-pre-wrap">{saved?.document.text}</p></article> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <TextInput label="Document title" value={title} maxLength={160} required disabled={disabled} onChange={event => { setTitle(event.target.value); }} />
      <TextArea label="Document text" value={text} rows={14} maxLength={50000} disabled={disabled} onChange={event => { setText(event.target.value); }} />
      {saved && dirty ? <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setTitle(saved.document.title); setText(saved.document.text); }}>Discard unsaved changes</Button> : null}
      {dirty ? <details className="space-y-4 border-y border-gray-border py-4"><summary className="cursor-pointer text-sm">Preview changes</summary>
        {saved ? <details><summary>Before</summary><h3 className="mt-3 font-medium">{saved.document.title}</h3><p className="whitespace-pre-wrap text-sm">{saved.document.text || "Empty document"}</p></details> : null}
        <article><h3 className="font-medium">{title}</h3><p className="mt-3 whitespace-pre-wrap text-sm">{text || "Empty document"}</p></article>
      </details> : null}
      <Button type="submit" disabled={disabled || !dirty || !title.trim()}>{busy ? "Saving…" : "Save document"}</Button>
    </form>}
    {saved ? <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="font-display text-xl">Change history</h2>
      {!saved.document.history.length ? <p className="text-sm text-gray-muted">Created {new Date(saved.document.createdAt).toLocaleString()}. No edits yet.</p> : <ol className="space-y-3">{saved.document.history.slice(-20).reverse().map(receipt => <li key={receipt.revision} className="border-b border-gray-border pb-3 text-sm"><p>Revision {receipt.revision}: {receipt.kind === "undo" ? "Undid the previous edit" : "Saved document changes"}</p><time className="text-gray-muted" dateTime={receipt.at}>{new Date(receipt.at).toLocaleString()}</time><details className="mt-2"><summary>Before and after</summary><p className="mt-2 whitespace-pre-wrap">{receipt.before.title}{"\n"}{receipt.before.text}</p><hr className="my-3 border-gray-border" /><p className="whitespace-pre-wrap">{receipt.after.title}{"\n"}{receipt.after.text}</p></details></li>)}</ol>}
      {saved.document.history.at(-1)?.kind === "edit" && !readOnly ? <Button type="button" variant="secondary" disabled={disabled || dirty} onClick={() => void save(true)}>Undo last edit</Button> : null}
      {dirty && saved.document.history.length ? <p className="text-sm text-gray-muted">Save or discard your unsaved text before using Undo.</p> : null}
    </section> : null}
    </>}
  </section>;
}
