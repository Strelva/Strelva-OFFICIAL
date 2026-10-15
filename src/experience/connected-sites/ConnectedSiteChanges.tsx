"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton, StToggle } from "@/components/ui/strelva/Kit";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import { actorLabel } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import {
  connectedSiteChangeBrief, connectedSiteChangesViewSchema, editGuide,
  type ConnectedSiteChange, type ConnectedSiteChangeStep, type ConnectedSiteChangesView, type PendingConnectedSiteRequest,
} from "@/products/connected-sites/client";
import type { SitePlatform } from "@/products/connected-sites/contracts";
import styles from "./connected-sites.module.css";

const ENDPOINT = "/api/workspace/connected-sites/changes";
const UNCONFIRMED = "We couldn't confirm that change. Reload before trying again.";
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const latest = (change: ConnectedSiteChange, kind: ConnectedSiteChangeStep["kind"]) => [...change.steps].reverse().find(step => step.kind === kind);

type Load =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "error"; message: string }
  | { status: "ready"; view: ConnectedSiteChangesView; ownerEmail: boolean };

const readBody = z.object({ view: connectedSiteChangesViewSchema, ownerEmail: z.boolean().optional() });

interface PlanDraft { pageUrl: string; whatToChange: string; expectText: string; removeText: string; ownerFacing: boolean; title: string }

/** The agency's plan form: the exact edit, and what Strelva should see on the live page afterwards. */
function PlanForm({ initial, withTitle, disabled, busy, onSubmit, onCancel }: {
  initial: Partial<PlanDraft> & { pageUrl: string }; withTitle: boolean; disabled: boolean; busy: boolean;
  onSubmit: (draft: PlanDraft) => void; onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>({ whatToChange: "", expectText: "", removeText: "", ownerFacing: true, title: "", ...initial });
  const [problem, setProblem] = useState("");
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => { setDraft(current => ({ ...current, [key]: value })); setProblem(""); };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (withTitle && !draft.title.trim()) return setProblem("Name the change.");
    if (!draft.whatToChange.trim()) return setProblem("Say what to change.");
    if (!draft.expectText.trim()) return setProblem("Say what the page should say afterwards.");
    try { new URL(draft.pageUrl); } catch { return setProblem("Enter the address of the page to change."); }
    onSubmit(draft);
  }
  return <form className={styles.stack} onSubmit={submit} noValidate aria-label="Plan a change">
    {withTitle ? <TextInput label="Title" value={draft.title} maxLength={300} onChange={event => set("title", event.target.value)} /> : null}
    <TextInput label="Page to change" type="url" inputMode="url" value={draft.pageUrl} spellCheck={false} autoCapitalize="none" onChange={event => set("pageUrl", event.target.value)} />
    <TextArea label="What to change" value={draft.whatToChange} maxLength={500} onChange={event => set("whatToChange", event.target.value)} />
    <TextInput label="After the edit, the page should say" value={draft.expectText} maxLength={300} helperText="Strelva looks for this text on the live page." onChange={event => set("expectText", event.target.value)} />
    <TextInput label="Text that should be gone (optional)" value={draft.removeText} maxLength={300} onChange={event => set("removeText", event.target.value)} />
    <div className={styles.stack}>
      <StToggle label="The owner should say yes first" checked={draft.ownerFacing} onChange={value => set("ownerFacing", value)} reason="Turn off only for fixes the owner doesn't need to approve, like a typo or a broken link." />
      <p className={styles.body}>Turn off only for fixes the owner doesn&rsquo;t need to approve, like a typo or a broken link.</p>
    </div>
    {problem ? <p role="alert" className={styles.body}>{problem}</p> : null}
    <div className={styles.actions}>
      <StPill type="submit" busy={busy} disabled={disabled}>Save the plan</StPill>
      {onCancel ? <StTextButton disabled={busy} onClick={onCancel}>Cancel</StTextButton> : null}
    </div>
  </form>;
}

/**
 * Changes on a connected site. Strelva never edits the site: the owner asks
 * their agency, the agency plans the exact edit for the builder's own editor,
 * the owner says yes in Needs you when it is theirs to say, the agency makes
 * the edit and marks it done, and Strelva reads the live page and records a
 * Release. Every call is rechecked on the server.
 */
export function ConnectedSiteChanges({ workspaceId, systemId, focusRequestId }: { workspaceId: string; systemId: string; focusRequestId?: string }) {
  const request = useWorkspaceRequest();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useState<{ tone: "status" | "alert"; text: string } | null>(null);
  const [ask, setAsk] = useState({ words: "", page: "" });
  const [planning, setPlanning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inFlight = useRef(false);
  const rows = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await request(`${ENDPOINT}?${new URLSearchParams({ workspaceId, systemId })}`);
        if (!active) return;
        if (response.status === 404) { setLoad({ status: "hidden" }); return; }
        const parsed = readBody.safeParse(await response.json().catch(() => null));
        setLoad(response.ok && parsed.success ? { status: "ready", view: parsed.data.view, ownerEmail: parsed.data.ownerEmail ?? false } : { status: "error", message: "The changes on this site could not be loaded." });
      } catch {
        if (active) setLoad({ status: "error", message: "The changes on this site could not be reached." });
      }
    })();
    return () => { active = false; };
  }, [request, workspaceId, systemId]);

  const ready = load.status === "ready" ? load : null;
  useEffect(() => {
    if (!ready || !focusRequestId) return;
    const target = ready.view.changes.find(change => change.requestId === focusRequestId)?.id ?? focusRequestId;
    rows.current.get(target)?.scrollIntoView?.({ block: "center" });
  }, [ready, focusRequestId]);

  const lock = useCallback(() => { setUnconfirmed(true); setNotice({ tone: "alert", text: UNCONFIRMED }); }, []);

  /** One write at a time. A 4xx with a message is shown as is; anything unclear locks the page until reload. */
  async function act(key: string, body: Record<string, unknown>, success?: (raw: unknown) => string): Promise<boolean> {
    if (inFlight.current || unconfirmed || !ready) return false;
    inFlight.current = true; setBusy(key); setNotice(null);
    try {
      const response = await request(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, systemId, ...body }) });
      const raw: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = readBody.safeParse(raw);
        if (!parsed.success) { lock(); return false; }
        setLoad({ status: "ready", view: parsed.data.view, ownerEmail: ready.ownerEmail });
        if (success) setNotice({ tone: "status", text: success(raw) });
        return true;
      }
      const message = z.object({ error: z.string() }).safeParse(raw);
      if (response.status >= 500 || !message.success) lock();
      else setNotice({ tone: "alert", text: message.data.error });
      return false;
    } catch {
      lock();
      return false;
    } finally {
      inFlight.current = false; setBusy(null);
    }
  }

  /** The agency answering a Request in the shared service-request path. */
  async function respond(item: PendingConnectedSiteRequest, decision: "accepted" | "declined") {
    if (inFlight.current || unconfirmed || !ready) return;
    inFlight.current = true; setBusy(`respond:${item.id}`); setNotice(null);
    try {
      const response = await request("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "respond", requestId: item.id, expectedRevision: item.revision, decision, idempotencyKey: `kys:${item.id}:${decision}` }) });
      if (!response.ok) {
        const raw = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
        const text = typeof raw?.error === "string" ? raw.error : raw?.error?.message;
        if (response.status >= 500 || !text) lock(); else setNotice({ tone: "alert", text });
        return;
      }
      const fresh = await request(`${ENDPOINT}?${new URLSearchParams({ workspaceId, systemId })}`);
      const parsed = readBody.safeParse(await fresh.json().catch(() => null));
      if (fresh.ok && parsed.success) setLoad({ status: "ready", view: parsed.data.view, ownerEmail: ready.ownerEmail });
      else lock();
    } catch {
      lock();
    } finally {
      inFlight.current = false; setBusy(null);
    }
  }

  if (load.status === "hidden") return null;
  if (load.status === "loading") return <StSection id={`${systemId}-changes`} title="Changes on this site"><p className={styles.body} role="status">Loading the changes on this site…</p></StSection>;
  if (load.status === "error") return <StSection id={`${systemId}-changes`} title="Changes on this site"><StNotice tone="critical">{load.message} The site itself is unchanged.</StNotice></StSection>;

  const { view, ownerEmail } = load;
  const agency = view.viewer.actingAgencyId !== null;
  const canAsk = !agency && ["owner", "admin"].includes(view.viewer.role);
  const agencyName = view.viewer.agencyName ?? "Your agency";
  const client = view.viewer.businessName ?? "the owner";
  const platformLabel = view.site.platformLabel ?? editGuide(view.site.platform as SitePlatform).label;
  const locked = unconfirmed || busy !== null;
  const needsYouHref = `/workspace?${new URLSearchParams({ view: "needs-you", workspaceId })}`;
  const taskUrl = (typeof window !== "undefined" ? window.location.origin : "") + `/workspace?${new URLSearchParams({ view: "system", system: systemId, workspaceId })}`;
  const absolute = (page: string | null) => { try { return new URL(page ?? "", view.site.siteUrl).toString(); } catch { return view.site.siteUrl; } };
  const pending = view.requests.filter(item => item.accepted !== "declined");

  async function copyBrief(change: ConnectedSiteChange) {
    try {
      await navigator.clipboard.writeText(connectedSiteChangeBrief({ change, siteHost: view.site.siteHost, platformLabel, taskUrl }));
      setCopied(change.id);
    } catch { setNotice({ tone: "alert", text: "Copy is unavailable. Select the steps and copy them manually." }); }
  }
  const planBody = (draft: PlanDraft, extra: Record<string, unknown>) => ({
    action: "plan", siteId: view.site.id, ...extra, ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    plan: { pageUrl: draft.pageUrl.trim(), whatToChange: draft.whatToChange.trim(), expectText: draft.expectText.trim(), ...(draft.removeText.trim() ? { removeText: draft.removeText.trim() } : {}), ownerFacing: draft.ownerFacing },
  });
  const release = (raw: unknown) => {
    const number = (raw as { release?: { number?: number } } | null)?.release?.number;
    return number ? `Release ${number} recorded. Strelva saw the change on the live page.` : "Saved. Strelva checked the live page.";
  };

  function renderChange(change: ConnectedSiteChange) {
    const planned = latest(change, "planned");
    const checked = latest(change, "checked");
    const released = latest(change, "released");
    const state = (() => {
      switch (change.stage) {
        case "planned_waiting": return <StState kind="need">Waiting on {client}</StState>;
        case "ready_to_make": return <StState kind="need">Ready to make</StState>;
        case "checking": return <StState kind="draft">Checking</StState>;
        case "not_seen": return <StState kind="need">Not seen yet</StState>;
        case "done": return <StState kind="live">Done</StState>;
        case "done_unconfirmed": return <StState kind="draft">Recorded</StState>;
        case "declined": return <StState kind="draft">Not yet</StState>;
        case "withdrawn": return <StState kind="draft">Withdrawn</StState>;
        default: return <StState kind="draft">Planned</StState>;
      }
    })();
    const body = (() => {
      switch (change.stage) {
        case "planned_waiting":
          return agency
            ? <><p className={styles.body}>Waiting on {client} to say yes in Needs you.</p>{!ownerEmail ? <p className={styles.body}>Owner email is off, so they weren&rsquo;t emailed. They see this in Needs you when they sign in.</p> : null}</>
            : view.viewer.isOwner ? <StTextButton href={needsYouHref}>Open Needs you</StTextButton> : <p className={styles.body}>Waiting on {client} to say yes in Needs you.</p>;
        case "ready_to_make":
          return agency ? <div className={styles.stack}>
            <h3 className={styles.stepTitle}>Make this edit in {platformLabel}</h3>
            <StRows label={`Steps for ${platformLabel}`}>{(planned?.editSteps ?? []).map((step, index) => <StRow key={`${index}:${step}`} lead={<StMono>{index + 1}</StMono>} title={step} stackOnPhone={false} />)}</StRows>
            <div className={styles.actions}>
              <StPill variant="soft" disabled={locked} onClick={() => void copyBrief(change)}>{copied === change.id ? "Task copied" : "Copy task for your agent"}</StPill>
              <StPill busy={busy === `done:${change.id}`} disabled={locked} onClick={() => void act(`done:${change.id}`, { action: "done", changeId: change.id }, release)}>Mark done</StPill>
              <StTextButton tone="danger" disabled={locked} onClick={() => void act(`withdraw:${change.id}`, { action: "withdraw", changeId: change.id })}>Withdraw</StTextButton>
            </div>
            <p className={styles.body}>Mark it done once it&rsquo;s published. Strelva then reads the live page.</p>
          </div> : <p className={styles.body}>{agencyName} is making this edit in {platformLabel}.</p>;
        case "checking":
          return <p className={styles.body} role="status" aria-busy="true">Checking the live page…</p>;
        case "not_seen":
          return <div className={styles.stack}>
            <p className={styles.body}>Strelva didn&rsquo;t see &ldquo;{planned?.expectText}&rdquo; on {planned?.pageUrl ?? view.site.siteHost} yet.</p>
            <p className={styles.body}>{checked?.checkResult === "unreachable" ? "Strelva couldn’t open the page just now." : "Builders can take a minute to publish. If the text is drawn in the browser, Strelva can’t read it."}</p>
            {agency ? confirming === change.id ? <div className={styles.stack}>
              <StNotice>This records Release {view.site.nextReleaseNumber ?? "next"} saying Strelva didn&rsquo;t see the change live.</StNotice>
              <div className={styles.actions}>
                <StPill busy={busy === `unconfirmed:${change.id}`} disabled={locked} onClick={() => void act(`unconfirmed:${change.id}`, { action: "record_unconfirmed", changeId: change.id }, raw => `Release ${(raw as { release?: { number?: number } }).release?.number ?? ""} recorded without Strelva seeing it live.`).then(done => { if (done) setConfirming(null); })}>Record without confirmation</StPill>
                <StTextButton disabled={locked} onClick={() => setConfirming(null)}>Cancel</StTextButton>
              </div>
            </div> : <div className={styles.actions}>
              <StPill variant="soft" busy={busy === `check:${change.id}`} disabled={locked} onClick={() => void act(`check:${change.id}`, { action: "check", changeId: change.id }, release)}>Check again</StPill>
              <StTextButton disabled={locked} onClick={() => setConfirming(change.id)}>Record without confirmation</StTextButton>
              <StTextButton tone="danger" disabled={locked} onClick={() => void act(`withdraw:${change.id}`, { action: "withdraw", changeId: change.id })}>Withdraw</StTextButton>
            </div> : null}
          </div>;
        case "done":
          return <p className={styles.body}>Release {released?.releaseNumber} · Strelva saw it on the live page · {released ? day(released.recordedAt) : ""}</p>;
        case "done_unconfirmed":
          return <p className={styles.body}>Release {released?.releaseNumber} · recorded without Strelva seeing it live</p>;
        case "declined":
          return <div className={styles.stack}>
            <p className={styles.body}>{client} said not yet. Nothing changed on the site.</p>
            {agency ? planning === change.id
              ? <PlanForm withTitle={false} disabled={locked} busy={busy === `plan:${change.id}`} initial={{ pageUrl: planned?.pageUrl ?? view.site.siteUrl, expectText: planned?.expectText ?? "", removeText: planned?.removeText ?? "" }}
                  onCancel={() => setPlanning(null)} onSubmit={draft => void act(`plan:${change.id}`, planBody(draft, { changeId: change.id }), () => "Saved the new plan.").then(done => { if (done) setPlanning(null); })} />
              : <div><StPill variant="soft" disabled={locked} onClick={() => setPlanning(change.id)}>Plan it again</StPill></div> : null}
          </div>;
        case "withdrawn":
          return <p className={styles.body}>Withdrawn</p>;
        default:
          return null;
      }
    })();
    return <StRow key={change.id} title={change.title} end={state} align="start" detail={<span className={styles.stack} ref={node => { if (node) rows.current.set(change.id, node); else rows.current.delete(change.id); }}>
      {body}
      <span className={styles.history}>{change.steps.map(step => <span key={step.id}>{STEP_WORDS[step.kind]} · {actorLabel(step.actor)} · {day(step.recordedAt)}</span>)}</span>
    </span>} />;
  }

  return <StSection id={`${systemId}-changes`} title="Changes on this site" meta={<StMono>{view.changes.length + pending.length}</StMono>}>
    <p className={styles.body}>Strelva never edits {view.site.siteHost}. {agencyName} makes changes in {platformLabel}&rsquo;s own editor. Strelva checks the live page afterwards and records a Release.</p>
    {canAsk ? <form className={styles.stack} aria-label={`Ask ${agencyName}`} noValidate onSubmit={event => {
      event.preventDefault();
      if (!ask.words.trim()) { setNotice({ tone: "alert", text: "Say what should change." }); return; }
      const page = ask.page.trim();
      void act("ask", { action: "ask", words: ask.words.trim(), ...(page ? { page } : {}), idempotencyKey: crypto.randomUUID() }, () => `Asked ${agencyName}. You'll see the planned edit in Needs you before anything changes.`).then(done => { if (done) setAsk({ words: "", page: "" }); });
    }}>
      <TextArea label="What should change?" placeholder="Update the Saturday hours to 9–2" value={ask.words} maxLength={3000} readOnly={locked} onChange={event => setAsk(current => ({ ...current, words: event.target.value }))} />
      <TextInput label="Which page? (optional)" placeholder={view.site.siteUrl} value={ask.page} maxLength={500} readOnly={locked} onChange={event => setAsk(current => ({ ...current, page: event.target.value }))} />
      <div><StPill type="submit" busy={busy === "ask"} disabled={unconfirmed}>{`Ask ${agencyName}`}</StPill></div>
    </form> : null}
    {pending.length ? <StRows label="Requests not yet planned">{pending.map(item => <StRow key={item.id} title={item.outcome} align="start" detail={<span className={styles.stack} ref={node => { if (node) rows.current.set(item.id, node); else rows.current.delete(item.id); }}>
      {item.page ? <span>Page: {item.page}</span> : null}
      {agency ? item.accepted === "pending"
        ? <span className={styles.actions}>
            <StPill variant="soft" busy={busy === `respond:${item.id}`} disabled={locked} onClick={() => void respond(item, "accepted")}>Accept</StPill>
            <StTextButton disabled={locked} onClick={() => void respond(item, "declined")}>Not now</StTextButton>
          </span>
        : planning === item.id
          ? <PlanForm withTitle={false} disabled={locked} busy={busy === `plan:${item.id}`} initial={{ pageUrl: absolute(item.page), whatToChange: item.request }} onCancel={() => setPlanning(null)}
              onSubmit={draft => void act(`plan:${item.id}`, planBody(draft, { requestId: item.id }), () => "Saved the plan.").then(done => { if (done) setPlanning(null); })} />
          : <span><StPill variant="soft" disabled={locked} onClick={() => setPlanning(item.id)}>Plan this change</StPill></span>
        : <span>Asked · waiting for {agencyName} to plan it</span>}
    </span>} end={<StMono as="time" dateTime={item.createdAt}>{day(item.createdAt)}</StMono>} />)}</StRows> : null}
    {view.changes.length ? <StRows label="Changes">{view.changes.map(renderChange)}</StRows> : null}
    {!view.changes.length && !pending.length ? <p className={styles.body}>No changes yet.</p> : null}
    {agency ? planning === "new"
      ? <PlanForm withTitle disabled={locked} busy={busy === "plan:new"} initial={{ pageUrl: view.site.siteUrl }} onCancel={() => setPlanning(null)}
          onSubmit={draft => void act("plan:new", planBody(draft, {}), () => "Saved the plan.").then(done => { if (done) setPlanning(null); })} />
      : <div><StTextButton disabled={locked} onClick={() => setPlanning("new")}>Plan a change</StTextButton></div> : null}
    {notice ? <StNotice tone={notice.tone === "alert" ? "critical" : undefined}><span role={notice.tone}>{notice.text}</span></StNotice> : null}
    {unconfirmed ? <div><StPill variant="soft" onClick={() => window.location.reload()}>Reload</StPill></div> : null}
  </StSection>;
}

const STEP_WORDS: Record<ConnectedSiteChangeStep["kind"], string> = {
  planned: "Planned", approved: "Said yes", declined: "Said not yet", marked_done: "Marked done", checked: "Checked the live page", released: "Release recorded", withdrawn: "Withdrawn",
};
