"use client";

import { useState } from "react";
import { z } from "zod";
import { StMono, StNotice, StPill, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { IntakeAppView, IntakeLiveCheck, IntakeSubmissionView } from "@/products/vertical-intake/client";
import styles from "./intake-app.module.css";
import visitor from "@/experience/bookings/visitor.module.css";
import { VisitorIntakeForm } from "./VisitorIntakeForm";

const HIPAA_NOTE = "Strelva isn't set up to hold patient health information yet (it isn't a HIPAA-covered system). This form asks only for contact details, insurance plan, a reason from a short list and preferred times, and asks patients not to include medical details.";
const MEMBER_ID_OFF = "Off. Asking for member IDs waits until Strelva can hold them under a business associate agreement.";
const errorBody = z.object({ error: z.string() });
const revealBody = z.object({ values: z.array(z.object({ label: z.string(), value: z.string() })) });
const checkBody = z.object({ check: z.object({ state: z.enum(["found", "not_seen", "unreachable"]), checkedAt: z.string(), url: z.string(), release: z.number().nullable() }) });

function statusLine(view: IntakeAppView): string {
  const install = view.install;
  if (!install) return "Not set up";
  const base = install.status === "live" ? `Live · Release ${install.liveRelease}` : install.status === "paused" ? `Paused${install.liveRelease ? ` · Release ${install.liveRelease}` : ""}` : "Draft";
  return install.liveRequestedAt ? `${base} · Waiting in Needs you` : base;
}

function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function requestState(submission: IntakeSubmissionView, proposes: boolean): string {
  if (submission.state === "visit_booked") return "Visit booked";
  if (submission.state === "not_booked") return "Not booked";
  return proposes && submission.email ? "Waiting in Needs you" : "No open time matched. Call them.";
}

function checkLine(check: IntakeLiveCheck): string {
  if (check.state === "found") return `The form is on ${check.url}${check.release ? ` (Release ${check.release})` : ""}.`;
  if (check.state === "not_seen") return `We couldn't see the form on ${check.url}. If your site draws it with JavaScript, open the page and check by eye.`;
  return `We couldn't open ${check.url} just now.`;
}

/** Dental intake on Inquiries: set up, install, make it live, check, pause, and read what patients sent. */
export function IntakeAppPanel({ workspaceId, initial }: { workspaceId: string; initial: IntakeAppView }) {
  const request = useWorkspaceRequest();
  const [view, setView] = useState(initial);
  const [serviceId, setServiceId] = useState(initial.install?.draftConfig.bookingServiceId ?? "");
  const [pageUrl, setPageUrl] = useState(initial.install?.draftConfig.pageUrl ?? "");
  const [memberId, setMemberId] = useState(initial.install?.draftConfig.collectMemberId ?? false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [check, setCheck] = useState<IntakeLiveCheck | null>(initial.install?.lastLiveCheck ?? null);
  const [revealed, setRevealed] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [copied, setCopied] = useState("");
  const install = view.install;
  const canEdit = ["owner", "admin", "agency"].includes(view.access);
  const isOwner = view.access === "owner";
  const needsYou = `/workspace?${new URLSearchParams({ workspaceId, view: "needs-you" })}`;
  const config = install?.draftConfig;
  const dirty = (config?.bookingServiceId ?? "") !== serviceId || (config?.pageUrl ?? "") !== pageUrl || (config?.collectMemberId ?? false) !== memberId;
  const missing = view.readiness.filter(row => row.blocking && row.state !== "done").map(row => row.label);
  const liveBlock = !install ? "Set up Dental intake first." : dirty ? "Save your changes first." : !view.canGoLive ? `Finish first: ${missing.join(", ")}.` : install.liveRequestedAt ? "Waiting in Needs you." : install.status === "paused" ? "Turn it back on first." : "";

  async function send(body: Record<string, unknown>): Promise<unknown> {
    const response = await request("/api/workspace/vertical-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, appId: view.app.appId, ...body }) });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorBody.safeParse(raw).data?.error ?? "That could not be confirmed. Reload the page and check before trying again.");
    return raw;
  }
  async function refresh(): Promise<IntakeAppView> {
    const response = await request(`/api/workspace/vertical-intake?${new URLSearchParams({ workspaceId, appId: view.app.appId })}`);
    if (!response.ok) throw new Error("Reload the page to see the latest.");
    return await response.json() as IntakeAppView;
  }
  async function run(name: string, body: Record<string, unknown>, done: string, after?: (raw: unknown) => void) {
    if (busy) return;
    setBusy(name); setError(""); setNote("");
    try {
      const raw = await send(body);
      after?.(raw);
      if (name !== "reveal" && name !== "check") {
        const next = await refresh();
        setView(next);
        setServiceId(next.install?.draftConfig.bookingServiceId ?? ""); setPageUrl(next.install?.draftConfig.pageUrl ?? ""); setMemberId(next.install?.draftConfig.collectMemberId ?? false);
      }
      setNote(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be confirmed.");
    } finally { setBusy(null); }
  }
  const save = () => run("save", { action: "save", expectedRevision: install?.draftRevision ?? 0, config: { bookingServiceId: serviceId || null, pageUrl: pageUrl.trim() || null, collectMemberId: memberId, formLabel: config?.formLabel ?? "Send" } }, install ? "Saved." : "Dental intake is set up as a draft.");
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); } catch { setError("Copy is unavailable. Select the lines and copy them manually."); }
  }

  return <section id="dental-intake" aria-labelledby="dental-intake-title" className={styles.root}>
    <div className={styles.stack}>
      <div className={styles.head}><h2 id="dental-intake-title" className={styles.title}>{view.app.name}</h2><span className={styles.by}>By Strelva</span><StMono>{statusLine(view)}</StMono></div>
      <p className={styles.body}>A new-patient form for your website. Patients tell you who they are, their insurance, why they&rsquo;re coming and when they&rsquo;re free. Tooth pain or swelling tells them to call you now.</p>
      <StNotice>{HIPAA_NOTE}</StNotice>
      {!view.emailOn ? <p className={styles.body}>Patients aren&rsquo;t emailed while customer email is off. The office calls them back.</p> : null}
    </div>

    <StSection title="Before it can go live">
      <StRows label="Readiness">{view.readiness.map(row => <StRow key={row.id} lead={<span aria-hidden="true">{row.state === "done" ? "✓" : row.state === "note" ? "•" : "○"}</span>} title={row.label} detail={`${row.state === "done" ? "Done. " : row.state === "missing" ? (row.blocking ? "Needed. " : "Optional. ") : ""}${row.detail}`}
        end={row.state !== "done" && (row.id === "phone" || row.id === "insurance" || row.id === "hours") ? <StTextButton href={`/workspace/business-details?${new URLSearchParams({ workspaceId })}`}>Open Business details</StTextButton> : row.state !== "done" && row.id === "site" ? <StTextButton href={`/workspace/site?${new URLSearchParams({ workspaceId })}`}>Connect your website</StTextButton> : undefined} />)}</StRows>
    </StSection>

    {view.previewForm?.fields ? <StSection title="What patients see">
      <div className={visitor.frame}><VisitorIntakeForm form={view.previewForm} /></div>
    </StSection> : null}

    {canEdit ? <StSection title="Settings">
      <form className={styles.stack} onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Dental intake settings">
        <SelectInput label="Propose visit times from" value={serviceId} options={[{ value: "", label: "Don't propose times" }, ...view.services.map(service => ({ value: service.id, label: service.name }))]} onChange={event => setServiceId(event.target.value)} disabled={busy !== null} />
        <TextInput label="Page with the form" type="url" inputMode="url" placeholder="https://yourpractice.com/new-patients" value={pageUrl} onChange={event => setPageUrl(event.target.value)} helperText="Optional. Where Strelva looks for the form when it checks your live page." disabled={busy !== null} spellCheck={false} />
        <div>
          <label className={styles.check}><input type="checkbox" checked={memberId && view.sensitiveAvailable} disabled={!view.sensitiveAvailable || busy !== null} onChange={event => setMemberId(event.target.checked)} aria-describedby="dental-intake-member-id" /><span>Ask for insurance member ID</span></label>
          <p id="dental-intake-member-id" className={styles.body}>{view.sensitiveAvailable ? "Stored encrypted, shown only to owners and admins, deleted after 30 days." : MEMBER_ID_OFF}</p>
        </div>
        <div className={styles.actions}><StPill type="submit" busy={busy === "save"} disabled={(!dirty && install !== null) || busy !== null}>{install ? "Save settings" : "Set up Dental intake"}</StPill></div>
      </form>
    </StSection> : null}

    {install && view.sites.length ? <StSection title="Add it to your website">
      {view.sites.map(site => <div key={site.siteId} className={styles.stack}>
        <p className={styles.body}>{site.host}: put these two lines on the page where the form should appear.</p>
        <pre className={styles.code} tabIndex={0} aria-label={`Two lines for ${site.host}`}>{`${site.lines.script}\n${site.lines.mount}`}</pre>
        <div className={styles.actions}><StPill variant="soft" onClick={() => void copy(`${site.lines.script}\n${site.lines.mount}`, site.siteId)}>{copied === site.siteId ? "Copied" : "Copy"}</StPill></div>
        <details><summary>Site built in code</summary><pre className={styles.code} tabIndex={0} aria-label={`Code site tag for ${site.host}`}>{site.codeSnippet}</pre></details>
      </div>)}
    </StSection> : null}

    {canEdit && install ? <StSection title="Make it live">
      <div className={styles.stack}>
        <div className={styles.actions}>
          {isOwner ? <StPill busy={busy === "request"} disabled={liveBlock !== "" || busy !== null} onClick={() => void run("request", { action: "request_live" }, "Ready for your decision in Needs you.")}>Make it live</StPill>
            : <StPill busy={busy === "request"} disabled={liveBlock !== "" || busy !== null} onClick={() => void run("request", { action: "request_live" }, "The owner has been asked in Needs you.")}>Ask the owner to make it live</StPill>}
          {install.liveRequestedAt ? <StTextButton href={needsYou}>Review it in Needs you</StTextButton> : null}
          {install.liveRelease ? <StPill variant="soft" busy={busy === "pause"} disabled={busy !== null} onClick={() => void run("pause", { action: "pause", paused: install.status !== "paused" }, install.status === "paused" ? "Turned back on." : "Paused. Patients see the office's phone, not the form.")}>{install.status === "paused" ? "Turn back on" : "Pause"}</StPill> : null}
          {install.liveRelease ? <StPill variant="soft" busy={busy === "check"} disabled={busy !== null} onClick={() => void run("check", { action: "check_live" }, "Checked.", raw => { const parsed = checkBody.safeParse(raw); if (parsed.success) setCheck(parsed.data.check); })}>Check the live page</StPill> : null}
        </div>
        {liveBlock ? <p className={styles.body}>{liveBlock}</p> : null}
        {check ? <p role="status" className={styles.body}>{checkLine(check)}</p> : null}
      </div>
    </StSection> : null}

    {error ? <StNotice tone="critical"><p role="alert">{error}</p></StNotice> : note ? <p role="status" className={styles.body}>{note}</p> : null}

    <StSection title="Recent requests">
      {view.submissions.length ? <StRows label="Recent Dental intake requests">{view.submissions.map(submission => <StRow key={submission.id} align="start"
        title={<>{submission.name}{submission.triage === "urgent" ? <> <span className={styles.urgent}>Urgent</span></> : null}</>}
        detail={<>{[submission.reasonLabel, requestState(submission, Boolean(install?.draftConfig.bookingServiceId) && view.manualBookingsOn), ago(submission.createdAt)].filter(Boolean).join(" · ")}
          {submission.hasSensitive && (view.access === "owner" || view.access === "admin") ? <>
            {revealed[submission.id] ? <span className={styles.reveal}>{revealed[submission.id]!.map(item => `${item.label}: ${item.value}`).join(" · ")} <StTextButton onClick={() => setRevealed(({ [submission.id]: _gone, ...rest }) => rest)}>Hide</StTextButton></span>
              : <> <StTextButton disabled={busy !== null} onClick={() => void run("reveal", { action: "reveal", submissionId: submission.id }, "", raw => { const parsed = revealBody.safeParse(raw); if (parsed.success) setRevealed(current => ({ ...current, [submission.id]: parsed.data.values })); })}>Show member ID</StTextButton></>}</> : null}</>} />)}</StRows>
        : <p className={styles.body}>Nothing yet. Requests from the form show here, and in Inquiries.</p>}
    </StSection>
  </section>;
}
