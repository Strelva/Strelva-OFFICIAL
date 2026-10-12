"use client";
import { useEffect, useRef, useState } from "react";
import { StEmpty, StLabel, StNotice, StPill, StSection, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { agencyPageChoicesSchema, agencyPageInputSchema, agencyPageReceiptSchema } from "@/products/websites/contracts";
import type { z } from "zod";
import { actorLabel } from "@/platform/presentation/actor";

type Choices = z.infer<typeof agencyPageChoicesSchema>;
function message(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }

/** A local review is explicit. Send persists one candidate in the business's
 * native website review, with no publication, email, or service creation. */
export function AgencyNativePage({ request, workspaceId, businessName, url, kind }: {
  request: typeof fetch; workspaceId: string; businessName: string; url: string; kind: "form" | "booking";
}) {
  const [choices, setChoices] = useState<Choices | null>(null);
  const [workId, setWorkId] = useState("");
  const [title, setTitle] = useState(kind === "form" ? "Get in touch" : "Book a visit");
  const [path, setPath] = useState(kind === "form" ? "/inquiry" : "/book");
  const [description, setDescription] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [receipt, setReceipt] = useState<z.infer<typeof agencyPageReceiptSchema> | null>(null);
  const pending = useRef<string | null>(null); const inFlight = useRef(false);
  const available = choices?.choices.filter(choice => kind === "form" ? choice.inquiry : choice.booking) ?? [];
  const selected = available.find(choice => choice.workId === workId);
  useEffect(() => {
    const controller = new AbortController();
    void request(`${url}&action=pages&workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, credentials: "same-origin", cache: "no-store" }).then(async response => {
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(value, "The website connections could not be read."));
      const parsed = agencyPageChoicesSchema.safeParse(value);
      if (!parsed.success) throw new Error("The website choices could not be confirmed. Refresh connections.");
      const result = parsed.data;
      if (result.workspaceId !== workspaceId) throw new Error("The website choices belong to another business.");
      if (!controller.signal.aborted) { setChoices(result); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The website connections could not be read."); });
    return () => controller.abort();
  }, [request, url, workspaceId, attempt]);
  function reviewDraft() {
    if (!selected) return;
    const result = agencyPageInputSchema.safeParse({ workspaceId, workId, kind, title, path, description, commandId: crypto.randomUUID(), expectedRevision: selected.expectedRevision, candidateRevision: selected.candidateRevision, candidateContentHash: selected.candidateContentHash });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the page details."); return; }
    setError(""); setReview(true);
  }
  async function send() {
    if (!selected || !review || inFlight.current || receipt) return;
    inFlight.current = true; setBusy(true); setError("");
    pending.current ??= JSON.stringify({ workspaceId, workId: selected.workId, kind, title, path, description,
      expectedRevision: selected.expectedRevision, candidateRevision: selected.candidateRevision, candidateContentHash: selected.candidateContentHash, commandId: crypto.randomUUID() });
    try {
      const response = await request(`${url}&action=send-page`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(value, "The outcome could not be confirmed. Retry the same page."));
      const parsed = agencyPageReceiptSchema.safeParse(value);
      if (!parsed.success) throw new Error("The page receipt could not be confirmed. Retry the same page.");
      const result = parsed.data;
      const command = agencyPageInputSchema.parse(JSON.parse(pending.current));
      if (result.workspaceId !== workspaceId || result.workId !== selected.workId || result.commandId !== command.commandId || result.candidateRevision !== selected.candidateRevision + 1) throw new Error("The page receipt could not be confirmed. Retry the same page.");
      setReceipt(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The page could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <StSection title={kind === "form" ? "Draft a form page" : "Draft a booking page"}>
    <StLabel>Your agency needs website access and {kind === "form" ? "inquiry" : "booking"} access. This page uses the website’s existing published connection. Its fields, service, times and account stay with {businessName}.</StLabel>
    {!choices && !error ? <StSkeleton label="Reading permitted website connections" /> : null}
    {error ? <StNotice tone="critical">{error}{!pending.current ? <StTextButton onClick={() => setAttempt(value => value + 1)}>Refresh connections</StTextButton> : <StLabel>The same command is retained. Retry before preparing another page.</StLabel>}</StNotice> : null}
    {choices && !available.length ? <StEmpty>No connected {kind === "form" ? "form" : "booking service"} is available. The business needs a published native website with its own current connection before you can draft this page here.</StEmpty> : null}
    {available.length ? <div className="space-y-5">
      <SelectInput label="Website" value={workId} disabled={review || busy} onChange={event => setWorkId(event.target.value)} options={[{ value: "", label: "Choose a website" }, ...available.map(choice => ({ value: choice.workId, label: `${choice.title} · Release ${choice.candidateRevision}` }))]} />
      {selected ? <>
        {!review ? <><TextInput label="Page title" value={title} maxLength={70} required onChange={event => setTitle(event.target.value)} /><TextInput label="Page address" value={path} maxLength={80} required onChange={event => setPath(event.target.value)} /><TextArea label="Page description" value={description} maxLength={160} rows={3} onChange={event => setDescription(event.target.value)} /><StPill onClick={reviewDraft}>Review draft</StPill></> : <>
          <StSurface label="Review the page"><StLabel>{businessName} · {path} · Release {selected.candidateRevision + 1} draft</StLabel><h3 className="font-display text-xl">{title}</h3><p className="text-sm">{description}</p><StNotice>{kind === "form" ? "The website’s published inquiry form appears here." : "The website’s published booking service appears here with its configured times."} No new service, customer record or account is created.</StNotice></StSurface>
          {!pending.current ? <StTextButton onClick={() => setReview(false)}>Edit draft</StTextButton> : null}
          <StPill disabled={busy || Boolean(receipt)} busy={busy} onClick={() => void send()}>{pending.current && !receipt ? `Retry sending to ${businessName}` : `Send to ${businessName}`}</StPill>
        </>}
      </> : null}
    </div> : null}
    {receipt ? <StNotice><span role="status">Sent to {businessName} for website review. Prepared by {actorLabel(receipt.actor)}. Nothing is live yet; no notification was sent.</span><StTextButton href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(receipt.workId)}`}>Open the saved website draft</StTextButton></StNotice> : null}
  </StSection>;
}
