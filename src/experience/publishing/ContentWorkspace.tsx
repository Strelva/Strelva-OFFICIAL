"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";

interface Entry { slug: string; status: string; data: Record<string, unknown> }
interface Draft { id: string; title: string; body: string; status: string; metadata?: { publishing?: Record<string, unknown> } }
interface Issue { id: string; subject: string; body: string; approved_at: string; state: string; accepted_count: number; suppressed_count: number; failure_count: number; event_id: string; delivery?: { state: string; accepted: number; suppressed: number; unconfirmedBatches: number; receipts: Array<{ id: string; detail: string; accepted: number; suppressed: number }> } | null }
export interface ContentWorkspaceData {
  content: { entries: Array<{ type: string; entries: Entry[] }>; drafts: Draft[]; outputs: Issue[]; receipts?: Array<{ id: string; subject: string; createdAt: string; providerRef: string | null; request: Record<string, unknown>; beforeState: unknown; actor: string; readbackDetail: string | null; undoLabel: string }>; sendingEnabled: false };
  permissions: { canCompose: boolean; canApprove: boolean };
}
export function ContentWorkspace({ workspaceId, systemId, kind, readOnly = false, initial, request = fetch }: { workspaceId: string; systemId: string; kind: "website" | "newsletter"; readOnly?: boolean; initial?: ContentWorkspaceData; request?: typeof fetch }) {
  const [loaded, setLoaded] = useState(initial); const [loading, setLoading] = useState(!initial); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [type, setType] = useState("blog"); const [slug, setSlug] = useState(""); const [fields, setFields] = useState<Record<string, string>>({}); const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request(`/api/workspace/publishing/content?${new URLSearchParams({ workspaceId, systemId })}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Publishing could not be loaded.");
      setLoaded(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Publishing could not be loaded."); }
    finally { setLoading(false); }
  }, [workspaceId, systemId, request]);
  useEffect(() => { if (!initial) void load(); }, [initial, load]);
  const canCompose = !readOnly && loaded?.permissions.canCompose; const canApprove = !readOnly && loaded?.permissions.canApprove;
  async function command(action: "compose" | "restore" | "approve" | "not_yet", eventId?: string, receiptId?: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      let draft: unknown;
      if (action === "compose") {
        if (kind === "newsletter") draft = { kind: "newsletter", subject: fields.subject || "", body: fields.body || "" };
        else {
          const data: Record<string, unknown> = { ...fields };
          if (type === "blog" || type === "video") data.tags = (fields.tags || "").split(",").map(tag => tag.trim()).filter(Boolean);
          if (type === "product") { data.priceCents = Math.round(Number(fields.price || "0") * 100); data.images = (fields.images || "").split("\n").map(image => image.trim()).filter(Boolean); data.inStock = fields.inStock !== "false"; delete data.price; }
          for (const key of ["coverImage", "thumbnail", "checkoutUrl"]) if (!data[key]) delete data[key];
          draft = { kind: "collection", type, ...(slug ? { slug } : {}), data };
        }
      }
      const response = await request("/api/workspace/publishing/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, systemId, action, ...(draft ? { draft } : {}), ...(eventId ? { eventId } : {}), ...(receiptId ? { receiptId } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || data.result?.reason || "This change could not be confirmed. Reload before trying again.");
      if (action === "compose" || action === "restore") { setComposing(false); setFields({}); setSlug(""); setMessage("Saved for the owner's review. Nothing has been published or sent."); }
      else setMessage(kind === "newsletter" && action === "approve" ? "Issue approved. Check its receipt below for sending status." : action === "not_yet" ? "Draft declined. Nothing changed." : "Published to this System's content store. Website rendering has not been checked.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "This change could not be confirmed."); }
    finally { setBusy(false); }
  }
  const field = (key: string, label: string, multiline = false) => {
    const Component = multiline ? TextArea : TextInput;
    return <Component key={key} label={label} value={fields[key] || ""} disabled={busy} onChange={event => setFields(old => ({ ...old, [key]: event.target.value }))} />;
  };
  return <section className="grid gap-4 p-6" aria-label={kind === "newsletter" ? "Newsletter issues" : "Website content"} aria-busy={loading || busy}>
    <div><h2 className="text-sm font-semibold">{kind === "newsletter" ? "Newsletter" : "Blog and collections"}</h2><p className="mt-2 text-sm text-gray-muted">{kind === "newsletter" ? "Compose and approve each issue here. Its receipts show whether email was sent." : "Draft content here, then review the exact words before publishing."}</p></div>
    {loading ? <p role="status">Loading publishing…</p> : null}
    {error ? <div role="alert"><p>{error}</p><Button variant="ghost" onClick={() => void load()}>Reload publishing</Button></div> : null}
    {message ? <p role="status" className="text-sm text-gray-muted">{message}</p> : null}
    {!loading && loaded && !loaded.content.drafts.length && !loaded.content.entries.some(group => group.entries.length) && !loaded.content.outputs.length ? <p className="text-sm text-gray-muted">{kind === "newsletter" ? "No issues yet." : "No collection entries yet."}</p> : null}
    {loaded && !canCompose ? <p className="text-sm text-gray-muted">Publishing is read only for your account or this System.</p> : null}
    {canCompose && !composing ? <Button variant="secondary" onClick={() => { setComposing(true); setFields({}); setSlug(""); }}>Compose {kind === "newsletter" ? "an issue" : "an entry"}</Button> : null}
    {composing ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void command("compose"); }}>
      {kind === "newsletter" ? <>{field("subject", "Subject")}{field("body", "Message", true)}</> : <>
        <SelectInput options={[{ value: "blog", label: "Blog" }, { value: "video", label: "Video" }, { value: "product", label: "Product catalog" }]} label="Collection" value={type} disabled={busy} onChange={event => { setType(event.target.value); setFields({}); setSlug(""); }} />
        <TextInput label="URL name" value={slug} disabled={busy} helperText="Leave blank to use the title. Existing URL names propose a revision of that entry." onChange={event => setSlug(event.target.value)} />
        {type === "blog" ? <>{field("title", "Title")}{field("excerpt", "Excerpt", true)}{field("body", "Post", true)}{field("author", "Author")}{field("tags", "Tags, separated by commas")}{field("coverImage", "Cover image URL")}</> : type === "video" ? <>{field("title", "Title")}{field("description", "Description", true)}{field("videoUrl", "Video URL")}{field("thumbnail", "Thumbnail URL")}{field("tags", "Tags, separated by commas")}</> : <>{field("name", "Product name")}{field("description", "Description", true)}{field("price", "Price")}{field("currency", "Currency")}{field("images", "Image URLs, one per line", true)}{field("checkoutUrl", "Checkout URL")}<SelectInput options={[{ value: "true", label: "In stock" }, { value: "false", label: "Out of stock" }]} label="Availability" value={fields.inStock || "true"} onChange={event => setFields(old => ({ ...old, inStock: event.target.value }))} /></>}
      </>}
      <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}>Save for approval</Button><Button variant="ghost" disabled={busy} onClick={() => setComposing(false)}>Cancel</Button></div>
    </form> : null}
    {loaded?.content.entries.map(group => group.entries.length ? <div key={group.type}><h3 className="text-sm font-semibold">{group.type === "blog" ? "Blog posts" : group.type === "video" ? "Videos" : "Product catalog"}</h3><ul className="mt-2 grid gap-3">{group.entries.map(entry => <li key={entry.slug} className="text-sm"><span>{String(entry.data.title || entry.data.name || entry.slug)} · {entry.status}</span>{canCompose ? <Button variant="ghost" onClick={() => { setType(group.type); setSlug(entry.slug); setFields(Object.fromEntries(Object.entries(entry.data).map(([key, value]) => [key, key === "priceCents" ? String(Number(value) / 100) : Array.isArray(value) ? value.join(key === "images" ? "\n" : ", ") : String(value)]))); if (entry.data.priceCents !== undefined) setFields(old => ({ ...old, price: String(Number(entry.data.priceCents) / 100) })); setComposing(true); }}>Draft revision</Button> : null}</li>)}</ul></div> : null)}
    {loaded?.content.drafts.filter(draft => draft.status === "pending" || draft.status === "dismissed").map(draft => <article key={draft.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{draft.title}</h3><p className="text-sm text-gray-muted">{draft.status === "pending" ? "Needs approval" : draft.status === "dismissed" ? "Declined" : kind === "newsletter" ? "Approved · sending paused" : "Approved · published to the content store"}</p><details><summary className="cursor-pointer text-sm">Review exact content</summary><div className="mt-2 whitespace-pre-wrap break-words text-sm">{kind === "newsletter" ? draft.body : Object.entries((draft.metadata?.publishing?.data || {}) as Record<string, unknown>).map(([key, value]) => <p key={key}><strong>{key}: </strong>{Array.isArray(value) ? value.join(", ") : String(value)}</p>)}</div></details>{canApprove && draft.status === "pending" ? <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void command("approve", draft.id)}>{kind === "newsletter" ? "Approve issue" : "Approve and publish"}</Button><Button variant="ghost" disabled={busy} onClick={() => void command("not_yet", draft.id)}>Not yet</Button></div> : null}</article>)}
    {loaded?.content.receipts?.map(receipt => <article key={receipt.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{receipt.subject}</h3><p className="text-sm text-gray-muted">{receipt.readbackDetail}</p><p className="text-sm text-gray-muted">Approved by {receipt.actor}. {receipt.undoLabel}</p>{canCompose ? <Button variant="secondary" disabled={busy} onClick={() => void command("restore", undefined, receipt.id)}>Prepare restore or unpublish</Button> : null}{receipt.providerRef ? <a className="text-sm underline" href={receipt.providerRef} target="_blank" rel="noopener noreferrer">Open published content</a> : null}<details><summary className="cursor-pointer text-sm">Before and after</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">Before: {JSON.stringify(receipt.beforeState)}{ "\n" }After: {JSON.stringify(receipt.request.data)}</p></details></article>)}
    {loaded?.content.outputs.map(issue => <article key={issue.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{issue.subject}</h3><p className="text-sm text-gray-muted">Approved {new Date(issue.approved_at).toLocaleDateString()}. {issue.delivery ? ({ accepted: "Provider accepted.", send_unconfirmed: "Send outcome unconfirmed. Strelva must reconcile before retrying.", sending_pending: "Waiting to send.", not_sent_gated: "Sending paused.", not_sent_suppressed: "Not sent: no active subscribers." }[issue.delivery.state] || "Sending status unknown.") : "Sending paused."} Provider accepted: {issue.delivery?.accepted ?? issue.accepted_count}. Suppressed: {issue.delivery?.suppressed ?? issue.suppressed_count}. Unconfirmed batches: {issue.delivery?.unconfirmedBatches ?? issue.failure_count}. Delivered: unknown.</p>{issue.delivery?.receipts.map(receipt => <p key={receipt.id} className="text-sm text-gray-muted">{receipt.detail} Accepted: {receipt.accepted}. Suppressed: {receipt.suppressed}.</p>)}<details><summary className="cursor-pointer text-sm">Approved issue</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{issue.body}</p></details></article>)}
  </section>;
}
