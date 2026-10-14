"use client";
import { useCallback, useEffect, useState } from "react";
import { StField, StHead, StLabel, StRows, StRow, StSection, StEmpty, StNotice, StPage, StPill, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { NewsletterSurface, type NewsletterContext } from "./NewsletterSurface";
import styles from "./publishing.module.css";

interface Entry { slug: string; status: string; data: Record<string, unknown> }
interface Draft { id: string; title: string; body: string; status: string; metadata?: { publishing?: Record<string, unknown> } }
interface Issue { id: string; subject: string; body: string; approved_at: string; state: string; accepted_count: number; suppressed_count: number; failure_count: number; event_id: string; delivery?: { state: string; accepted: number; suppressed: number; unconfirmedBatches: number; receipts: Array<{ id: string; detail: string; accepted: number; suppressed: number }> } | null }
export interface ContentWorkspaceData {
  content: { entries: Array<{ type: string; entries: Entry[] }>; drafts: Draft[]; outputs: Issue[]; receipts?: Array<{ id: string; subject: string; createdAt: string; providerRef: string | null; request: Record<string, unknown>; beforeState: unknown; actor: string; readbackDetail: string | null; undoLabel: string }>; sendingEnabled: false };
  permissions: { canCompose: boolean; canApprove: boolean };
}
export function ContentWorkspace({ workspaceId, systemId, kind, readOnly = false, initial, newsletterContext, standalone = false, request = fetch }: { workspaceId: string; systemId: string; kind: "website" | "newsletter"; readOnly?: boolean; initial?: ContentWorkspaceData; newsletterContext?: NewsletterContext; standalone?: boolean; request?: typeof fetch }) {
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
      else setMessage(kind === "newsletter" && action === "approve" ? "Approved issue saved. Sending is paused; copy it into your email tool." : action === "not_yet" ? "Draft declined. Nothing changed." : "Published to this System's content store. Website rendering has not been checked.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "This change could not be confirmed."); }
    finally { setBusy(false); }
  }
  const field = (key: string, label: string, multiline = false) => {
    const props = { value: fields[key] || "", disabled: busy, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(old => ({ ...old, [key]: event.target.value })) };
    return <StField key={key} label={label}>{multiline ? <textarea {...props} rows={6} /> : <input {...props} />}</StField>;
  };
  const websiteSurface = <section className={styles.stack} aria-label={kind === "newsletter" ? "Newsletter issues" : "Website content"} aria-busy={loading || busy}>
    {standalone ? <StHead title="Website content" crumb={{ label: "Systems", href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` }} meta="Draft content, then review the exact words before publishing." /> : <StLabel as="h3">Blog and collections</StLabel>}
    {loading ? <StSkeleton label="Loading publishing" /> : null}
    {error ? <StNotice tone="critical"><p>{error}</p><StTextButton disabled={busy || loading} onClick={() => void load()}>Reload publishing</StTextButton></StNotice> : null}
    {message ? <p role="status" className="text-sm text-gray-muted">{message}</p> : null}
    {!loading && loaded && !loaded.content.drafts.length && !loaded.content.entries.some(group => group.entries.length) && !loaded.content.outputs.length ? <StEmpty>{kind === "newsletter" ? "No issues yet." : "No collection entries yet."}</StEmpty> : null}
    {loaded && !canCompose ? <StNotice>Publishing is read only for your account or this System.</StNotice> : null}
    {canCompose && !composing ? <StTextButton onClick={() => { setComposing(true); setFields({}); setSlug(""); }}>Compose an entry</StTextButton> : null}
    {composing ? <StSurface label="Content draft"><form className={styles.stack} onSubmit={event => { event.preventDefault(); void command("compose"); }}>
      {kind === "newsletter" ? <>{field("subject", "Subject")}{field("body", "Message", true)}</> : <>
        <StField label="Collection"><select value={type} disabled={busy} onChange={event => { setType(event.target.value); setFields({}); setSlug(""); }}><option value="blog">Blog</option><option value="video">Video</option><option value="product">Product catalog</option></select></StField>
        <StField label="URL name" hint="Leave blank to use the title. Existing URL names propose a revision of that entry."><input value={slug} disabled={busy} onChange={event => setSlug(event.target.value)} /></StField>
        {type === "blog" ? <>{field("title", "Title")}{field("excerpt", "Excerpt", true)}{field("body", "Post", true)}{field("author", "Author")}{field("tags", "Tags, separated by commas")}{field("coverImage", "Cover image URL")}</> : type === "video" ? <>{field("title", "Title")}{field("description", "Description", true)}{field("videoUrl", "Video URL")}{field("thumbnail", "Thumbnail URL")}{field("tags", "Tags, separated by commas")}</> : <>{field("name", "Product name")}{field("description", "Description", true)}{field("price", "Price")}{field("currency", "Currency")}{field("images", "Image URLs, one per line", true)}{field("checkoutUrl", "Checkout URL")}<StField label="Availability"><select value={fields.inStock || "true"} disabled={busy} onChange={event => setFields(old => ({ ...old, inStock: event.target.value }))}><option value="true">In stock</option><option value="false">Out of stock</option></select></StField></>}
      </>}
      <div className="flex flex-wrap gap-2"><StPill type="submit" busy={busy}>Save for approval</StPill><StTextButton disabled={busy} onClick={() => setComposing(false)}>Cancel</StTextButton></div>
    </form></StSurface> : null}
    {loaded?.content.entries.map(group => group.entries.length ? <StSection key={group.type} title={group.type === "blog" ? "Blog posts" : group.type === "video" ? "Videos" : "Product catalog"}>
      <StRows>{group.entries.map(entry => <StRow key={entry.slug} title={String(entry.data.title || entry.data.name || entry.slug)} detail={entry.status} end={canCompose ? <StTextButton onClick={() => {
        setType(group.type); setSlug(entry.slug);
        setFields(Object.fromEntries(Object.entries(entry.data).map(([key, value]) => [key, key === "priceCents" ? String(Number(value) / 100) : Array.isArray(value) ? value.join(key === "images" ? "\n" : ", ") : String(value)])));
        if (entry.data.priceCents !== undefined) setFields(old => ({ ...old, price: String(Number(entry.data.priceCents) / 100) }));
        setComposing(true);
      }}>Draft revision</StTextButton> : undefined} />)}</StRows>
    </StSection> : null)}
    {loaded?.content.drafts.filter(draft => draft.status === "pending" || draft.status === "dismissed").map(draft => <article key={draft.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{draft.title}</h3><p className="text-sm text-gray-muted">{draft.status === "pending" ? "Needs approval" : draft.status === "dismissed" ? "Declined" : kind === "newsletter" ? "Approved · sending paused" : "Approved · published to the content store"}</p><details><summary className="cursor-pointer text-sm">Review exact content</summary><div className="mt-2 whitespace-pre-wrap break-words text-sm">{kind === "newsletter" ? draft.body : Object.entries((draft.metadata?.publishing?.data || {}) as Record<string, unknown>).map(([key, value]) => <p key={key}><strong>{key}: </strong>{Array.isArray(value) ? value.join(", ") : String(value)}</p>)}</div></details>{canApprove && draft.status === "pending" ? <div className="flex flex-wrap gap-2"><StPill disabled={busy || loading || Boolean(error) || composing} onClick={() => void command("approve", draft.id)}>Make it live</StPill><StTextButton disabled={busy} onClick={() => void command("not_yet", draft.id)}>Not yet</StTextButton></div> : null}</article>)}
    {loaded?.content.receipts?.map(receipt => <article key={receipt.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{receipt.subject}</h3><p className="text-sm text-gray-muted">{receipt.readbackDetail}</p><p className="text-sm text-gray-muted">Approved by {receipt.actor}. {receipt.undoLabel}</p>{canCompose ? <StPill variant="soft" disabled={busy} onClick={() => void command("restore", undefined, receipt.id)}>Prepare restore or unpublish</StPill> : null}{receipt.providerRef ? <a className="text-sm underline" href={receipt.providerRef} target="_blank" rel="noopener noreferrer">Open published content</a> : null}<details><summary className="cursor-pointer text-sm">Before and after</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">Before: {JSON.stringify(receipt.beforeState)}{ "\n" }After: {JSON.stringify(receipt.request.data)}</p></details></article>)}
    {loaded?.content.outputs.map(issue => <article key={issue.id} className="grid gap-2 border-t border-gray-border pt-4"><h3 className="text-sm font-semibold">{issue.subject}</h3><p className="text-sm text-gray-muted">Approved {new Date(issue.approved_at).toLocaleDateString()}. {issue.delivery ? ({ accepted: "Provider accepted.", send_unconfirmed: "Send outcome unconfirmed. Strelva must reconcile before retrying.", sending_pending: "Waiting to send.", not_sent_gated: "Sending paused.", not_sent_suppressed: "Not sent: no active subscribers." }[issue.delivery.state] || "Sending status unknown.") : "Sending paused."} Provider accepted: {issue.delivery?.accepted ?? issue.accepted_count}. Suppressed: {issue.delivery?.suppressed ?? issue.suppressed_count}. Unconfirmed batches: {issue.delivery?.unconfirmedBatches ?? issue.failure_count}. Delivered: unknown.</p>{issue.delivery?.receipts.map(receipt => <p key={receipt.id} className="text-sm text-gray-muted">{receipt.detail} Accepted: {receipt.accepted}. Suppressed: {receipt.suppressed}.</p>)}<details><summary className="cursor-pointer text-sm">Approved issue</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{issue.body}</p></details></article>)}
  </section>;
  if (kind === "newsletter") return <section aria-label="Newsletter issues" aria-busy={loading || busy}><StPage>
    {standalone ? <StHead crumb={{ label: "Systems", href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` }} title="Newsletter" beacon={loaded?.content.drafts.some(draft => draft.status === "pending") ? "need" : undefined} meta={newsletterContext ? `${newsletterContext.subscribers} subscribers · each issue waits for your approval` : "Strelva drafts each issue. You review the exact words before approving."} /> : <StLabel as="h3">Newsletter issues</StLabel>}
    {canCompose && !composing ? <StTextButton disabled={busy || loading} onClick={() => { setComposing(true); setFields({}); }}>Compose an issue</StTextButton> : null}
    {loading ? <><StSkeleton width="70%" label="Loading publishing" /><StSkeleton /></> : null}
    {error ? <StNotice tone="critical"><p>{error}</p><StTextButton disabled={busy || loading} onClick={() => void load()}>Reload publishing</StTextButton></StNotice> : null}
    {message ? <p role="status" className={styles.copy}>{message}</p> : null}
    {loaded && !canCompose ? <StNotice>Publishing is read only for your account or this System.</StNotice> : null}
    {composing ? <StSurface label="Compose an issue"><form className={styles.stack} onSubmit={event => { event.preventDefault(); void command("compose"); }}>
      {field("subject", "Subject")}{field("body", "Message", true)}
      <div className={styles.actions}><StPill type="submit" busy={busy}>Save for approval</StPill><StTextButton disabled={busy} onClick={() => setComposing(false)}>Cancel</StTextButton></div>
    </form></StSurface> : null}
    {loaded && !loading ? <NewsletterSurface data={loaded} context={newsletterContext} busy={busy} canApprove={Boolean(canApprove) && !composing && !error} command={(action, eventId) => void command(action, eventId)} /> : null}
  </StPage></section>;
  return standalone ? <StPage>{websiteSurface}</StPage> : websiteSurface;
}
