"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, Check, CircleAlert, ExternalLink, History, Loader2, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import type { Website, WebsiteBrief, WebsiteRecord } from "@/products/websites/contracts";
import {
  createWebsiteRequestId,
  serverWebsiteTransport,
  type WebsiteExperienceTransport,
} from "./contracts";
import styles from "./website-experience.module.css";
import { WebsiteConnections } from "./WebsiteConnections";

export type { Website, WebsiteBrief, WebsiteRecord, WebsiteExperienceTransport } from "./contracts";

export interface WebsiteExperienceProps {
  workspaceId: string;
  workId?: string;
  readOnly?: boolean;
  initialRequest?: string;
  onSaved?: (workId: string) => void;
  transport?: WebsiteExperienceTransport;
}

interface BriefFields {
  businessName: string;
  description: string;
  audience: string;
  primaryGoal: string;
  primaryCallToAction: string;
  contactEmail: string;
  notes: string;
}

const EMPTY_BRIEF: BriefFields = {
  businessName: "",
  description: "",
  audience: "",
  primaryGoal: "",
  primaryCallToAction: "Contact us",
  contactEmail: "",
  notes: "",
};

function fieldsFromBrief(brief: WebsiteBrief): BriefFields {
  return {
    businessName: brief.businessName,
    description: brief.description,
    audience: brief.audience ?? "",
    primaryGoal: brief.primaryGoal ?? "",
    primaryCallToAction: brief.primaryCallToAction ?? "Contact us",
    contactEmail: brief.contactEmail ?? "",
    notes: brief.notes ?? "",
  };
}

function briefFromFields(fields: BriefFields): WebsiteBrief {
  const brief: WebsiteBrief = {
    businessName: fields.businessName.trim(),
    description: fields.description.trim(),
    primaryCallToAction: fields.primaryCallToAction.trim() || "Contact us",
  };
  if (fields.audience.trim()) brief.audience = fields.audience.trim();
  if (fields.primaryGoal.trim()) brief.primaryGoal = fields.primaryGoal.trim();
  if (fields.contactEmail.trim()) brief.contactEmail = fields.contactEmail.trim();
  if (fields.notes.trim()) brief.notes = fields.notes.trim();
  return brief;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Saved recently"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function isLocalExportReady(website: Website): boolean {
  return website.status === "launch_pending" && website.launch.receipt?.provider === "local_export";
}

function statusLabel(website: Website): string {
  const status = website.status;
  if (isLocalExportReady(website)) return "Launch files ready";
  if (status === "draft") return "Draft saved";
  if (status === "preview_ready") return "Private preview ready";
  if (status === "approved") return "Approved revision";
  if (status === "launch_pending") return "Launch preparation pending";
  if (status === "published") return "Published";
  return "Needs attention";
}

function statusMessage(website: Website): string {
  if (isLocalExportReady(website)) return "Your approved website is ready to download. It has not been published.";
  if (website.status === "draft") return "Your website draft is saved while the next preview is being prepared.";
  if (website.status === "preview_ready") return `Preview version ${website.candidate?.revision ?? "current"} is ready for your review.`;
  if (website.status === "approved") return `Preview version ${website.approvedCandidateRevision ?? "current"} is approved. Prepare launch when you are ready.`;
  if (website.status === "launch_pending") return "Launch preparation is still pending. Check the saved status before trying again.";
  if (website.status === "published") return `Your website is published from preview version ${website.launch.candidateRevision ?? website.approvedCandidateRevision ?? "current"}.`;
  if (website.lastError?.stage === "artifact") return "We could not generate the preview. Your website draft is saved; try again.";
  if (website.lastError?.stage === "launch") return "We could not prepare launch. Your approved preview is saved; try launch preparation again.";
  return "The saved website needs attention before its next step can continue.";
}

function historyLabel(kind: Website["history"][number]["kind"]): string {
  const labels: Record<Website["history"][number]["kind"], string> = {
    created: "Created",
    revised: "Brief revised",
    candidate_generated: "Preview generated",
    candidate_failed: "Preview generation failed",
    approved: "Approved",
    launch_started: "Launch preparation started",
    launch_prepared: "Launch prepared",
    launch_confirmed: "Published",
    launch_failed: "Launch preparation failed",
  };
  return labels[kind];
}

function ArtifactPreview({ artifact }: { artifact: NonNullable<Website["candidate"]> }) {
  const pageCount = artifact.spec.pages && typeof artifact.spec.pages === "object" && !Array.isArray(artifact.spec.pages)
    ? Object.keys(artifact.spec.pages).length
    : 0;
  const exportHref = artifact.preview.href.startsWith("/") && artifact.preview.href.includes("/preview")
    ? artifact.preview.href.replace("/preview", "/export")
    : null;
  return (
    <article className={styles.preview} aria-label="Generated website preview">
      <div className={styles.previewTop}>
        <div>
          <strong>{artifact.spec.siteName}</strong>
          <span>Generated site preview · version {artifact.revision}</span>
        </div>
        <div className={styles.previewActions}>
          <a href={artifact.preview.href} target="_blank" rel="noopener noreferrer" className={styles.previewLink}>
            Open preview <ExternalLink size={14} aria-hidden="true" />
          </a>
          {exportHref ? <a href={exportHref} download className={styles.previewLink}>Download website</a> : null}
        </div>
      </div>
      <div className={styles.previewFrame}>
        <iframe
          title={`Generated website preview for ${artifact.spec.siteName}`}
          src={artifact.preview.href}
          sandbox="allow-same-origin"
        />
      </div>
      <p className={styles.previewMeta}>
        Preview version {artifact.revision} · {pageCount} {pageCount === 1 ? "page" : "pages"}
      </p>
    </article>
  );
}

function HistoryList({ history }: { history: readonly Website["history"][number][] }) {
  if (!history.length) return <p className={styles.notice}>No earlier revisions are recorded yet.</p>;
  return (
    <ol className={styles.historyList} aria-label="Website revision history">
      {history.slice().reverse().map((entry) => (
        <li key={`${entry.revision}:${entry.kind}:${entry.at}`}>
          <strong>Revision {entry.revision} · {historyLabel(entry.kind)}</strong>
          {entry.note ? <span>{entry.note}</span> : null}
          <time dateTime={entry.at}>{formatDate(entry.at)}</time>
        </li>
      ))}
    </ol>
  );
}

function StatusIcon({ website }: { website: Website }) {
  if (website.status === "approved" || website.status === "published") return <Check size={16} aria-hidden="true" />;
  if (website.status === "failed") return <CircleAlert size={16} aria-hidden="true" />;
  return <History size={16} aria-hidden="true" />;
}

export function WebsiteExperience(props: WebsiteExperienceProps) {
  return <WebsiteSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} />;
}

function WebsiteSession({
  workspaceId,
  workId,
  readOnly = false,
  initialRequest = "",
  onSaved,
  transport = serverWebsiteTransport,
}: WebsiteExperienceProps) {
  const [record, setRecord] = useState<WebsiteRecord | null>(null);
  const [fields, setFields] = useState<BriefFields>(() => ({ ...EMPTY_BRIEF, description: initialRequest }));
  const [loading, setLoading] = useState(Boolean(workId));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef(createWebsiteRequestId()).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workId) return;
    const controller = new AbortController();
    setLoading(true);
    transport.read({ workspaceId, workId }, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setRecord(next);
      setFields(fieldsFromBrief(next.website.brief));
      setLoadFailed(false);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The saved website could not be loaded.");
      if (!controller.signal.aborted) setLoadFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadAttempt, transport, workId, workspaceId]);

  const brief = useMemo(() => briefFromFields(fields), [fields]);
  const savedFields = record ? fieldsFromBrief(record.website.brief) : null;
  const dirty = Boolean(record && savedFields && (Object.keys(EMPTY_BRIEF) as Array<keyof BriefFields>).some((key) => fields[key] !== savedFields[key]));
  const canSubmitBrief = Boolean(brief.businessName && brief.description);

  async function run(label: string, operation: () => Promise<WebsiteRecord>, success: (next: WebsiteRecord) => string) {
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await operation();
      if (!mountedRef.current) return;
      setRecord(next);
      setFields(fieldsFromBrief(next.website.brief));
      setNotice(success(next));
      onSaved?.(next.workId);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(cause instanceof Error ? cause.message : `${label} could not be completed.`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function createOrRevise() {
    if (!canSubmitBrief) return;
    if (record) {
      await run("Preview generation", () => transport.revise({
        workspaceId,
        workId: record.workId,
        expectedRevision: record.website.revision,
        brief,
      }), next => `Private website preview generated as version ${next.website.candidate?.revision ?? next.website.revision}. Review it before approving.`);
      return;
    }
    await run("Preview generation", () => transport.create({ workspaceId, requestId, brief }), next => `Private website preview generated as version ${next.website.candidate?.revision ?? next.website.revision}.`);
  }

  async function approve() {
    if (!record?.website.candidate) return;
    const candidate = record.website.candidate;
    await run("Approval", () => transport.approve({
      workspaceId,
      workId: record.workId,
      expectedRevision: record.website.revision,
      candidateRevision: candidate.revision,
      candidateContentHash: candidate.contentHash,
    }), next => `Preview version ${next.website.approvedCandidateRevision ?? candidate.revision} is approved. Prepare launch when you are ready.`);
  }

  async function prepareLaunch() {
    if (!record?.website.candidate || record.website.approvedCandidateRevision == null) return;
    const candidate = record.website.candidate;
    if (candidate.revision !== record.website.approvedCandidateRevision) return;
    await run("Launch preparation", () => transport.prepareLaunch({
      workspaceId,
      workId: record.workId,
      expectedRevision: record.website.revision,
      candidateRevision: candidate.revision,
      candidateContentHash: candidate.contentHash,
    }), next => isLocalExportReady(next.website)
      ? "Your approved website files are ready to download."
      : next.website.status === "published"
      ? "The approved website is published."
      : "Launch preparation is pending. Check the saved status before trying again.");
  }

  async function reload() {
    if (!record || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await transport.read({ workspaceId, workId: record.workId }, new AbortController().signal);
      if (!mountedRef.current) return;
      setRecord(next);
      setFields(fieldsFromBrief(next.website.brief));
      setNotice("Saved status refreshed.");
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(cause instanceof Error ? cause.message : "The saved website could not be refreshed.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  const website = record?.website;
  const canApprove = Boolean(website?.status === "preview_ready" && website.candidate && !dirty);
  const canPrepare = Boolean(website?.status === "approved" && website.candidate && website.approvedCandidateRevision === website.candidate.revision);
  const canRetryPreview = Boolean(website?.status === "failed" && website.lastError?.stage === "artifact");
  const canRetryLaunch = Boolean(website?.status === "failed" && website.lastError?.stage === "launch" && website.candidate && website.approvedCandidateRevision === website.candidate.revision);

  if (loading) {
    return <section className={styles.root} aria-label="Website setup" aria-busy="true"><p className={styles.srStatus} role="status"><Loader2 className="mr-2 inline size-4 motion-safe:animate-spin" aria-hidden="true" />Opening your saved website…</p></section>;
  }

  return (
    <section className={styles.root} aria-label="Website setup" aria-busy={busy || undefined}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Website</p>
        <h1>{website?.title || "Create a useful website for your business"}</h1>
        <p>{record ? "Review your website draft, make changes and see its approval history." : "Describe your business and what visitors should be able to do. Start with a private website preview."}</p>
      </header>

      {readOnly ? <div className={styles.status}><ShieldCheck size={16} aria-hidden="true" /><span>You can review this website, but this access level cannot change it.</span></div> : null}
      {error ? <div className={styles.alert} role="alert">{error}<p className="mt-2 text-xs">Your entered details and saved work are unchanged.</p></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {workId && loadFailed && !record ? (
        <div className={styles.requestCard}>
          <p>This website draft could not be opened. Your saved work is unchanged.</p>
          <div className={styles.actions}><Button type="button" variant="secondary" onClick={() => { setError(""); setLoadFailed(false); setLoading(true); setLoadAttempt((attempt) => attempt + 1); }} icon={<RefreshCw size={16} />}>Try loading again</Button></div>
        </div>
      ) : !record ? (
        <BriefForm fields={fields} setFields={setFields} onSubmit={() => void createOrRevise()} busy={busy} readOnly={readOnly} submitLabel="Generate a private preview" canSubmit={canSubmitBrief} />
      ) : (
        <>
          <div className={styles.status} data-tone={website?.status === "failed" ? "attention" : undefined}>
            <StatusIcon website={website!} />
            <span><strong>{statusLabel(website!)}</strong> · {statusMessage(website!)}</span>
          </div>

          <div className={styles.requestCard}>
            <BriefForm fields={fields} setFields={setFields} onSubmit={() => void createOrRevise()} busy={busy} readOnly={readOnly} submitLabel={canRetryPreview ? "Try generating again" : "Generate a new preview"} canSubmit={canSubmitBrief} compact />
            <div className={styles.actions}>
              {!readOnly && canApprove ? <Button type="button" loading={busy} disabled={busy} onClick={() => void approve()} icon={<Check size={16} />}>Approve this preview</Button> : null}
              {!readOnly && canPrepare ? <Button type="button" loading={busy} disabled={busy} onClick={() => void prepareLaunch()} icon={<Rocket size={16} />}>Prepare launch</Button> : null}
              {!readOnly && canRetryLaunch ? <Button type="button" loading={busy} disabled={busy} onClick={() => void prepareLaunch()} icon={<RefreshCw size={16} />}>Retry launch preparation</Button> : null}
              {website!.status === "launch_pending" && !isLocalExportReady(website!) ? <Button type="button" variant="secondary" loading={busy} disabled={busy} onClick={() => void reload()} icon={<RefreshCw size={16} />}>Check saved status</Button> : null}
            </div>
            {dirty && !readOnly ? <p className={styles.notice}>Save this wording as a new preview before approving it. The current saved revision stays unchanged.</p> : null}
          </div>

          <WebsiteConnections key={`${record.workId}:${record.website.revision}`} record={record} disabled={readOnly || busy || dirty} onBusyChange={setBusy} onSaved={(next) => { setRecord(next); setNotice("Website forms updated. Review and approve the new preview."); onSaved?.(next.workId); }} />

          {website!.candidate ? (
            <section className={styles.previewSection} aria-labelledby="website-preview-heading">
              <div className={styles.sectionHeading}><h2 id="website-preview-heading">Generated website preview</h2><span>Work revision {website!.revision} · saved {formatDate(record.updatedAt)}</span></div>
              <ArtifactPreview artifact={website!.candidate} />
            </section>
          ) : <p className={styles.srStatus} role="status">A generated site preview is not available yet. Your saved brief remains available for recovery.</p>}

          <section className={styles.history} aria-labelledby="website-history-heading">
            <div className={styles.sectionHeading}><h2 id="website-history-heading">Revision history</h2><span>{website!.history.length} {website!.history.length === 1 ? "entry" : "entries"}</span></div>
            <HistoryList history={website!.history} />
          </section>
        </>
      )}
    </section>
  );
}

function BriefForm({
  fields,
  setFields,
  onSubmit,
  busy,
  readOnly,
  submitLabel,
  canSubmit,
  compact = false,
}: {
  fields: BriefFields;
  setFields: (next: BriefFields) => void;
  onSubmit: () => void;
  busy: boolean;
  readOnly: boolean;
  submitLabel: string;
  canSubmit: boolean;
  compact?: boolean;
}) {
  const update = (key: keyof BriefFields) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields({ ...fields, [key]: event.target.value });
  return (
    <form className={styles.briefForm} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className={styles.formGrid}>
        <TextInput label="Business name" value={fields.businessName} onChange={update("businessName")} maxLength={160} required disabled={busy || readOnly} />
        <TextInput label="Contact email (optional)" type="email" value={fields.contactEmail} onChange={update("contactEmail")} maxLength={254} disabled={busy || readOnly} />
      </div>
      <TextArea label="What does the business do?" value={fields.description} onChange={update("description")} rows={compact ? 3 : 5} maxLength={4_000} required disabled={busy || readOnly} helperText="Describe the business in your own words. This stays attached to the saved work." />
      <div className={styles.formGrid}>
        <TextInput label="Who should the site serve? (optional)" value={fields.audience} onChange={update("audience")} maxLength={1_000} disabled={busy || readOnly} />
        <TextInput label="Primary customer goal (optional)" value={fields.primaryGoal} onChange={update("primaryGoal")} maxLength={1_000} disabled={busy || readOnly} />
      </div>
      <TextInput label="Primary call to action" value={fields.primaryCallToAction} onChange={update("primaryCallToAction")} maxLength={300} disabled={busy || readOnly} helperText="For example, Request an appointment or Contact us." />
      <TextArea label="Additional notes (optional)" value={fields.notes} onChange={update("notes")} rows={compact ? 2 : 3} maxLength={4_000} disabled={busy || readOnly} />
      {!readOnly ? <div className={styles.actions}><Button type="submit" loading={busy} disabled={!canSubmit} icon={<ArrowRight size={16} />}>{submitLabel}</Button></div> : null}
    </form>
  );
}
