"use client";
import { useCallback, useState } from "react";
import { StCopy, StField, StHold, StNotice, StPill, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { careReportAgencyViewResponseSchema, careReportAgencyViewSchema, careReportFactsSchema, type CareReportAgencyView } from "@/platform/care-reports/contracts";
import { careDeliveryLine, careReleaseLabel, careShortDate } from "@/platform/care-reports/model";
import { careReportWorkspaceUrl } from "@/platform/care-reports/share";
import { CareReportDocument } from "./CareReportDocument";

const CONFLICT = "This report changed since you opened it. Reload, then try again.";
const NOTE_MAX = 2000;

/**
 * An agency prepares one client's monthly report: read the draft, add a note,
 * share a numbered Release, then copy the link or (when email is on) email it.
 * Staff see the draft and the Releases but have no controls that change anything.
 */
export function CareReportEditor({ initial, brand, emailOn, shareLinksOn, origin, request = fetch }: {
  initial: CareReportAgencyView;
  brand: OwnerBrand;
  emailOn: boolean;
  shareLinksOn: boolean;
  origin: string;
  request?: typeof fetch;
}) {
  const [view, setView] = useState(initial);
  const [note, setNote] = useState(initial.report.agencyNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<number, string>>({});
  const { report, releases } = view;
  const business = report.businessName;
  const latest = releases[0]?.number ?? 0;
  const facts = careReportFactsSchema.safeParse(report.draft);
  const base = `/api/workspace/care-reports/${report.id}`;
  const json = { credentials: "same-origin" as const, headers: { "Content-Type": "application/json" } };

  const reload = useCallback(async () => {
    const response = await request(base, { credentials: "same-origin" });
    const parsed = response.ok ? careReportAgencyViewResponseSchema.safeParse(await response.json()) : null;
    if (parsed?.success) { setView(parsed.data); setNote(parsed.data.report.agencyNote ?? ""); }
    else setProblem("The report could not be reloaded. Reload the page.");
  }, [base, request]);

  async function act(name: string, work: () => Promise<void>) {
    setBusy(name); setProblem(null); setMessage(null);
    try { await work(); } catch { setProblem("That was not confirmed. Reload the page to see the current state."); }
    finally { setBusy(null); }
  }
  const failed = async (response: Response) => {
    if (response.status === 409) { setProblem(CONFLICT); return true; }
    if (!response.ok) {
      const value = await response.json().catch(() => null);
      setProblem((value && typeof value.error === "string" && value.error) || "That was not changed. Reload the page to see the current state.");
      return true;
    }
    return false;
  };
  const post = (body: unknown) => request(base, { method: "POST", ...json, body: JSON.stringify(body) });

  const saveNote = () => act("note", async () => {
    const response = await post({ action: "note", note, expectedRevision: report.revision });
    if (await failed(response)) return;
    const parsed = careReportAgencyViewSchema.safeParse(await response.json());
    if (parsed.success) { setView(parsed.data); setMessage("Note saved."); } else setProblem("The note was not confirmed. Reload the page.");
  });
  const refresh = () => act("refresh", async () => {
    const response = await request("/api/workspace/care-reports", {
      method: "POST", ...json, body: JSON.stringify({ agencyWorkspaceId: report.agencyWorkspaceId, month: report.month, workspaceIds: [report.businessWorkspaceId] }),
    });
    if (await failed(response)) return;
    await reload(); setMessage("Numbers refreshed.");
  });
  const publish = () => act("publish", async () => {
    const response = await post({ action: "publish", expectedRevision: report.revision });
    if (await failed(response)) return;
    const value = await response.json() as { number: number };
    await reload(); setMessage(`${careReleaseLabel(value.number)} shared. ${business} sees it in Recaps.`);
  });
  const send = (release: number) => act(`send-${release}`, async () => {
    const response = await post({ action: "send", release });
    if (await failed(response)) return;
    const value = await response.json() as { line: string };
    setLines(current => ({ ...current, [release]: value.line }));
    await reload();
  });
  const share = () => act("share", async () => {
    const response = await post({ action: "share_link" });
    if (await failed(response)) return;
    const value = await response.json() as { url: string };
    setNewLink(value.url);
    await reload();
  });
  const revoke = () => act("revoke", async () => {
    const response = await post({ action: "revoke_link" });
    if (await failed(response)) return;
    setNewLink(null); await reload(); setMessage("The link is off.");
  });
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopyUrl(null); setMessage("Link copied."); }
    catch { setCopyUrl(url); }
  }

  const signedInLink = careReportWorkspaceUrl(origin, report.id, report.businessWorkspaceId, latest || undefined);
  const noteTooLong = note.length > NOTE_MAX;
  const noteDirty = note !== (view.report.agencyNote ?? "");

  return <>
    {facts.success
      ? <CareReportDocument snapshot={{ ...facts.data, agencyNote: view.report.agencyNote }} brand={brand} releaseNumber={null} audience="agency"
        back={{ label: "Clients", href: `/workspace?workspaceId=${encodeURIComponent(report.agencyWorkspaceId)}&view=clients` }} />
      : <StNotice tone="critical">This draft can&apos;t be shown. {view.canWrite ? "Refresh the numbers to rebuild it." : "Ask an agency owner or admin to refresh the numbers."}</StNotice>}
    <div data-print-hide className="grid gap-6">
      {message ? <StNotice><span role="status">{message}</span></StNotice> : null}
      {problem ? <StNotice tone="critical">{problem}</StNotice> : null}
      {view.canWrite ? <StSection title="Prepare this report">
        <StField label={`Note for ${business}`} hint={`${note.length} / ${NOTE_MAX}`}>
          <textarea value={note} maxLength={NOTE_MAX + 200} rows={4} onChange={event => setNote(event.target.value)} />
        </StField>
        <div className="flex flex-wrap items-center gap-3">
          <StPill variant="soft" busy={busy === "note"} disabled={busy !== null || noteTooLong} onClick={() => void saveNote()}>Save note</StPill>
          <StPill variant="soft" busy={busy === "refresh"} disabled={busy !== null} onClick={() => void refresh()}>Refresh the numbers</StPill>
        </div>
        {noteDirty ? <StCopy muted>Save the note before sharing.</StCopy> : null}
        <StHold label={`Hold to share ${careReleaseLabel(latest + 1)} with ${business}`} disabled={busy !== null || !facts.success || noteDirty} onAccept={() => void publish()} />
      </StSection> : <StNotice>You can read this report. Only an agency owner or admin can add a note or share it.</StNotice>}
      <StSection title="Releases">
        {releases.length ? <StRows label="Releases of this report">
          {releases.map(release => {
            const delivery = view.deliveries.find(item => item.releaseNumber === release.number) ?? null;
            const line = lines[release.number] ?? careDeliveryLine(delivery ? { status: delivery.status, reason: delivery.reason, recordedAt: delivery.recordedAt } : null, emailOn);
            return <StRow key={release.id} title={careReleaseLabel(release.number)} detail={<>Shared {careShortDate(release.publishedAt)}<br />{line}</>}
              end={<span className="flex items-center gap-3">
                <StTextButton href={`/workspace/care-reports/${report.id}?workspaceId=${report.agencyWorkspaceId}&release=${release.number}`}>Open</StTextButton>
                {view.canWrite ? <StTextButton disabled={!emailOn || busy !== null} onClick={() => void send(release.number)}>Email to {business}</StTextButton> : null}
              </span>} />;
          })}
        </StRows> : <StCopy muted>Nothing is shared yet. {business} sees a report only after you share a Release.</StCopy>}
      </StSection>
      <StSection title="Share">
        <div className="flex flex-wrap items-center gap-3">
          <StPill variant="soft" onClick={() => void copy(signedInLink)}>Copy link for signed-in owners</StPill>
          {view.canWrite && shareLinksOn ? <StPill variant="soft" busy={busy === "share"} disabled={busy !== null || !releases.length} onClick={() => void share()}>Create a link anyone can open</StPill> : null}
          {view.canWrite && shareLinksOn && view.shareLink ? <StTextButton tone="danger" disabled={busy !== null} onClick={() => void revoke()}>Turn off the link</StTextButton> : null}
        </div>
        {copyUrl ? <StField label="Copy this link"><input readOnly value={copyUrl} onFocus={event => event.currentTarget.select()} /></StField> : null}
        {newLink ? <div className="grid gap-2">
          <StField label="Link anyone can open"><input readOnly value={newLink} onFocus={event => event.currentTarget.select()} /></StField>
          <div><StPill variant="soft" onClick={() => void copy(newLink)}>Copy link</StPill></div>
          <StCopy muted>Anyone with this link can read this report. Turn it off any time.</StCopy>
        </div> : shareLinksOn && view.shareLink ? <StCopy muted>A link is on since {careShortDate(view.shareLink.createdAt)}. Create a new link to copy it again; the old one stops working.</StCopy> : null}
        {!emailOn ? <StCopy muted>{careDeliveryLine(null, false)}</StCopy> : null}
      </StSection>
    </div>
  </>;
}
