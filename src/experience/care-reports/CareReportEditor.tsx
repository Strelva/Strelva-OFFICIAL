"use client";
import { useCallback, useEffect, useState } from "react";
import { strelvaUndoWindowMs } from "@/platform/infra/motion";
import { XaAnswers, XaButton, XaDecision, XaField, XaHeadline, XaStatus, XaTextArea, XaTextLink, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
import { XaBlock, XaCrumbs, XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
import styles from "./care-report.module.css";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { careReportAgencyViewResponseSchema, careReportAgencyViewSchema, careReportFactsSchema, type CareReportAgencyView } from "@/platform/care-reports/contracts";
import { careDeliveryLine, careMonthLabel, careReleaseLabel, careShortDate } from "@/platform/care-reports/model";
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
  const [sharedNumber, setSharedNumber] = useState<number | null>(null);
  const [publishFailed, setPublishFailed] = useState(false);
  // The "shared" pill settles after the same window as any Undo, then the next Release waits.
  useEffect(() => {
    if (sharedNumber === null) return;
    const timer = window.setTimeout(() => setSharedNumber(null), strelvaUndoWindowMs);
    return () => window.clearTimeout(timer);
  }, [sharedNumber]);
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

  async function act(name: string, work: () => Promise<boolean | void>) {
    setBusy(name); setProblem(null); setMessage(null);
    if (name === "publish") setPublishFailed(false);
    try { if (await work() === false && name === "publish") setPublishFailed(true); }
    catch { setProblem("That was not confirmed. Reload the page to see the current state."); if (name === "publish") setPublishFailed(true); }
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
    if (await failed(response)) return false;
    const value = await response.json() as { number: number };
    await reload(); setSharedNumber(value.number); setMessage(`${careReleaseLabel(value.number)} shared. ${business} sees it in Recaps.`);
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
  const next = careReleaseLabel(latest + 1);
  const latestRelease = releases[0];
  const yesState: XaYesState = busy === "publish" ? "going" : publishFailed ? "failed" : sharedNumber !== null ? "live" : "waiting";
  const clientsHref = `/workspace?workspaceId=${encodeURIComponent(report.agencyWorkspaceId)}&view=clients`;

  const story = <>
    <XaCrumbs items={[{ label: "Clients", href: clientsHref }, { label: business }, { label: "Care plan report" }]} />
    <XaHeadline quiet={view.canWrite ? `${next} is a draft.` : latestRelease ? `${careReleaseLabel(latestRelease.number)} is shared.` : "Nothing is shared yet."}>
      {business}, {careMonthLabel(report.month).split(" ")[0]}.
    </XaHeadline>
    <XaAnswers labelWidth={110} rows={[
      ["With " + business, latestRelease ? `${careReleaseLabel(latestRelease.number)}, shared ${careShortDate(latestRelease.publishedAt)}` : "Nothing yet. They see a report only after you share it."],
      ["Link", shareLinksOn && view.shareLink ? `On since ${careShortDate(view.shareLink.createdAt)}` : shareLinksOn ? "Off" : "Signed-in owners only"],
    ]} />
    {message ? <XaNote role="status" tone="done">{message}</XaNote> : null}
    {problem && !publishFailed ? <XaNote role="alert" tone="down">{problem}</XaNote> : null}
    {view.canWrite ? <XaBlock label={`Note for ${business}`}>
      <div className={styles.prepare}>
        <XaTextArea label={<span className="sr-only">Note for {business}</span>} value={note} maxLength={NOTE_MAX + 200} rows={4} onChange={event => setNote(event.target.value)}
          hint={`${note.length} / ${NOTE_MAX}`} error={noteTooLong ? `Keep the note under ${NOTE_MAX} characters.` : undefined} placeholder="What you did this month, in your words" />
        <div className={styles.prepareActions}>
          <XaButton variant="secondary" size="sm" busy={busy === "note"} disabled={busy !== null || noteTooLong || !noteDirty} onClick={() => void saveNote()}>Save note</XaButton>
          <XaButton variant="quiet" size="sm" busy={busy === "refresh"} disabled={busy !== null} onClick={() => void refresh()}>Refresh the numbers</XaButton>
        </div>
      </div>
    </XaBlock> : <XaNote>You can read this report. Only an agency owner or admin can add a note or share it.</XaNote>}
    <XaBlock label="Releases">
      {releases.length ? <ul className={styles.releases} aria-label="Releases of this report">
        {releases.map(release => {
          const delivery = view.deliveries.find(item => item.releaseNumber === release.number) ?? null;
          const line = lines[release.number] ?? careDeliveryLine(delivery ? { status: delivery.status, reason: delivery.reason, recordedAt: delivery.recordedAt } : null, emailOn);
          return <li key={release.id}>
            <span className={styles.releaseLine}>
              <XaTextLink href={`/workspace/care-reports/${report.id}?workspaceId=${report.agencyWorkspaceId}&release=${release.number}`}>{careReleaseLabel(release.number)}</XaTextLink>
              <span className={styles.sub}>Shared {careShortDate(release.publishedAt)}</span>
              {view.canWrite ? <XaButton variant="quiet" size="sm" disabled={!emailOn || busy !== null} busy={busy === `send-${release.number}`} onClick={() => void send(release.number)}>Email to {business}</XaButton> : null}
            </span>
            <span className={styles.sub}>{line}</span>
          </li>;
        })}
      </ul> : <XaNote>Nothing is shared yet. {business} sees a report only after you share a Release.</XaNote>}
    </XaBlock>
    <XaBlock label="Share">
      <div className={styles.prepareActions}>
        <XaButton variant="secondary" size="sm" onClick={() => void copy(signedInLink)}>Copy link for signed-in owners</XaButton>
        {view.canWrite && shareLinksOn ? <XaButton variant="secondary" size="sm" busy={busy === "share"} disabled={busy !== null || !releases.length} onClick={() => void share()}>Create a link anyone can open</XaButton> : null}
        {view.canWrite && shareLinksOn && view.shareLink ? <XaButton variant="quiet" size="sm" disabled={busy !== null} onClick={() => void revoke()}>Turn off the link</XaButton> : null}
      </div>
      {copyUrl ? <XaField label="Copy this link" readOnly value={copyUrl} onFocus={event => event.currentTarget.select()} /> : null}
      {newLink ? <div className={styles.linkField}>
        <XaField label="Link anyone can open" readOnly value={newLink} onFocus={event => event.currentTarget.select()} hint="Anyone with this link can read this report. Turn it off any time." />
        <div><XaButton variant="secondary" size="sm" onClick={() => void copy(newLink)}>Copy link</XaButton></div>
      </div> : shareLinksOn && view.shareLink ? <XaNote>A link is on since {careShortDate(view.shareLink.createdAt)}. Create a new link to copy it again; the old one stops working.</XaNote> : null}
      {!emailOn ? <XaNote>{careDeliveryLine(null, false)}</XaNote> : null}
    </XaBlock>
  </>;

  const object = <XaDecision label={`${next} draft`}
    status={facts.success ? <XaStatus kind="draft">{next} draft</XaStatus> : <XaStatus kind="down">Can&apos;t be shown</XaStatus>}
    meta={`${business} sees it in Recaps after you share`}
    yes={view.canWrite ? <XaYes state={yesState} yesLabel={`Share ${next} with ${business}`} onYes={() => void publish()}
      liveLabel={sharedNumber !== null ? `${careReleaseLabel(sharedNumber)} shared with ${business}` : undefined}
      failure={problem ?? `${next} was not shared. ${business} still sees the last Release.`}
      disabledReason={!facts.success ? "Refresh the numbers to rebuild the draft first." : noteDirty ? "Save the note before sharing." : undefined} /> : null}>
    {facts.success
      ? <CareReportDocument flat snapshot={{ ...facts.data, agencyNote: view.report.agencyNote }} brand={brand} releaseNumber={null} audience="agency" />
      : <XaNote tone="down">This draft can&apos;t be shown. {view.canWrite ? "Refresh the numbers to rebuild it." : "Ask an agency owner or admin to refresh the numbers."}</XaNote>}
  </XaDecision>;

  return <XaObjectPage label={`${business} Care plan report`} story={story} object={object} wide />;
}
