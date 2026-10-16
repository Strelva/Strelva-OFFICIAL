"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { XaAnswers, XaButton, XaButtonLink, XaHeadline, XaLabel, XaPebbleScene, XaRow, XaRows, XaSays, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/record/record.module.css";

import { ownerExportHistorySchema, type OwnerExportHistory } from "@/platform/workspace-exports/history-contracts";
import type { WorkspaceExitOptions } from "@/platform/workspace-exit/contracts";

export type ExportManifestRow = { title: string; detail: string; count?: string; included: boolean };
const SCHEMA_3_SCOPE: ExportManifestRow[] = [
  { title: "Website pages and photos", detail: "Saved content and download references for original images.", included: true },
  { title: "Inquiries and replies", detail: "Stored messages, dates and delivery evidence.", included: true },
  { title: "Bookings and requests", detail: "Stored booking settings and business booking records.", included: true },
  { title: "Business record", detail: "Facts, Systems and Connections stored by Strelva.", included: true },
  { title: "History of every change", detail: "Stored History, versions and receipts.", included: true },
  { title: "Documents and uploads", detail: "Stored records and authenticated download references.", included: true },
  { title: "Billing and payments", detail: "Stored billing state and payment records.", included: true },
  { title: "Card details", detail: "Held by Stripe, never by Strelva.", included: false },
  { title: "Passwords and sign-ins", detail: "Passwords and sign-ins for connected accounts are never included.", included: false },
  { title: "Booking management links", detail: "They work like passwords, so they stay out.", included: false },
  { title: "Strelva’s internal notes", detail: "Strelva’s own records.", included: false },
  { title: "Records never imported", detail: "Download these from the service that holds them, such as your booking or email tool.", included: false },
];
/**
 * The static scope, said the way an owner thinks of it (XA · R6): four
 * groups instead of seven lines. A real manifest (with counts) is never
 * regrouped, so its numbers stay attached to what they count.
 */
function groupForOwner(rows: ExportManifestRow[], group: boolean): ExportManifestRow[] {
  if (!group) return rows;
  const by = new Map(rows.map(row => [row.title, row]));
  const groups: [string, string[], string][] = [
    ["Your website", ["Website pages and photos"], "Every page, and where each original photo is."],
    ["Inquiries and bookings", ["Inquiries and replies", "Bookings and requests"], "Every message, reply and booking, with dates."],
    ["Business record and history", ["Business record", "History of every change"], "Your details and every change, with who made it."],
    ["Documents, billing and payments", ["Documents and uploads", "Billing and payments"], "Your uploads, plus your billing and payment records."],
  ];
  const used = new Set<string>();
  const out: ExportManifestRow[] = [];
  for (const [title, members, detail] of groups) {
    const present = members.filter(member => by.has(member));
    if (!present.length) continue;
    present.forEach(member => used.add(member));
    out.push({ title, detail, included: true });
  }
  return [...out, ...rows.filter(row => !used.has(row.title))];
}

/** Which clay each part of the file wears (XA · R6). */
const EXPORT_TILE: Record<string, string> = {
  "Website pages and photos": "website", "Inquiries and replies": "inbox", "Bookings and requests": "bookings", "Business record": "documents",
  "History of every change": "documents", "Documents and uploads": "documents", "Billing and payments": "payments",
  "Your business and saved results": "documents", "Uploads": "documents",
  "Your website": "website", "Inquiries and bookings": "inbox", "Business record and history": "documents", "Documents, billing and payments": "payments",
};
const LEGACY_SCOPE: ExportManifestRow[] = [
  { title: "Your business and saved results", detail: "Your business, its settings and the results Strelva saved.", included: true },
  { title: "Uploads", detail: "Everything you uploaded, with a link to download each file.", included: true },
  { title: "Website, calendars and inquiries", detail: "Not in this smaller copy yet. Ask Strelva for them.", included: false },
  { title: "Passwords and Strelva's own notes", detail: "Passwords and sign-ins for connected accounts are never included.", included: false },
];

type ExportProps = { workspaceId: string; schema3?: boolean; request?: typeof fetch; businessName?: string; manifest?: ExportManifestRow[] };

type DomainLine = { siteName: string; done: boolean; evidence?: string };

/** The domain step of the exit handoff plan, where one exists. Any failure shows no domain line. */
function useDomainLines(workspaceId: string, request: typeof fetch): DomainLine[] {
  const [lines, setLines] = useState<DomainLine[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace-exit?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((body: { handoff?: WorkspaceExitOptions["handoff"]; state?: { handoff?: WorkspaceExitOptions["handoff"] } | null } | null) => {
        if (controller.signal.aborted) return;
        const plan = body?.state?.handoff ?? body?.handoff;
        setLines((plan?.sites ?? []).flatMap(site => site.steps.filter(step => step.kind === "domain").map(step => ({ siteName: site.siteName, done: step.status === "completed", evidence: step.evidence }))));
      }).catch(() => { if (!controller.signal.aborted) setLines([]); });
    return () => controller.abort();
  }, [workspaceId, request]);
  return lines;
}

export function WorkspaceExport(props: ExportProps) {
  // Workspace switches discard all prior archive references, including pending reads.
  return <WorkspaceExportScreen key={props.workspaceId} {...props} />;
}

function WorkspaceExportScreen({ workspaceId, schema3 = false, request = fetch, businessName, manifest }: ExportProps) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [exports, setExports] = useState<OwnerExportHistory>([]);
  const [historyLoading, setHistoryLoading] = useState(schema3);
  const [historyError, setHistoryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [pendingBuild, setPendingBuild] = useState<string | null>(null);
  const building = Boolean(pendingBuild) || exports.some(row => row.status === "building");
  const domains = useDomainLines(workspaceId, request);
  useEffect(() => {
    if (!schema3) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await request(`/api/workspace-export/v3/history?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal });
        const body = await response.json() as { exports?: unknown; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (!controller.signal.aborted) { setExports([]); setHistoryLoading(false); setHistoryError(body.error || "Export history could not be read. Try again."); }
          if (pendingBuild && response.status !== 401 && response.status !== 403) timer = setTimeout(() => void poll(), 10000);
          return;
        }
        const parsed = ownerExportHistorySchema.safeParse(body.exports);
        if (!parsed.success) throw new Error("Export history could not be confirmed. Try again.");
        const rows = parsed.data;
        if (rows.some(row => row.workspaceId !== workspaceId)) throw new Error("Export history could not be confirmed. Try again.");
        if (controller.signal.aborted) return;
        setExports(rows); setHistoryError(""); setHistoryLoading(false);
        const current = pendingBuild ? rows.find(row => row.buildId === pendingBuild) : undefined;
        if (current && current.status !== "building") {
          setPendingBuild(null);
          setError(current.status !== "ready");
          setNotice(current.status === "ready" ? "Your export is ready. Download it below." : "That export didn't finish. Press Download everything to try again.");
        }
        // Refresh ready archives too, so expiry removes their download controls.
        timer = setTimeout(() => void poll(), rows.some(row => row.status === "building") || pendingBuild && !current ? 3000 : 60000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        // A failed owner read must not leave stale archive links visible.
        setExports([]); setHistoryLoading(false);
        setHistoryError(cause instanceof Error && cause.message === "Export history could not be confirmed. Try again." ? cause.message : "Export history could not be read. Reload exports to check their current state.");
        if (pendingBuild) timer = setTimeout(() => void poll(), 10000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [workspaceId, schema3, request, refresh, pendingBuild]);
  async function download() {
    setLoading(true); setNotice(""); setError(false);
    try {
      const response = await request(schema3 ? "/api/workspace-export/v3" : "/api/workspace-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "The download could not be made."); }
      if (response.status === 202) {
        const body = await response.json() as { buildId?: string; message?: string };
        if (!body.buildId || !/^[0-9a-f-]{36}$/.test(body.buildId)) throw new Error("The export build could not be confirmed. Reload before trying again.");
        setPendingBuild(body.buildId); setNotice(body.message || "Your export is being prepared."); return;
      }
      const blob = await response.blob();
      const match = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = match?.[1] || "workspace-export.json"; link.click(); URL.revokeObjectURL(link.href);
      setNotice("Your file is downloading. Strelva recorded that you downloaded it, not what was in it.");
    } catch (cause) {
      setError(true); setNotice(cause instanceof Error ? cause.message : "The download could not be made.");
      // A lost POST response may still have started a build. Recover before retrying.
      if (schema3) { setHistoryLoading(true); setRefresh(value => value + 1); }
    }
    finally { setLoading(false); }
  }
  const rows = manifest ?? (schema3 ? SCHEMA_3_SCOPE : LEGACY_SCOPE);
  const included = groupForOwner(rows.filter(row => row.included), !manifest);
  const left = rows.filter(row => !row.included);
  const failed = error && notice ? notice : historyError;
  const scopeNote = !manifest ? schema3 ? "The file lists how many of each." : "This copy stops at 2 MB rather than give you half a file." : null;
  const newest = exports.find(row => row.status === "ready" && row.expiresAt);
  // Pebble's job beside the list: the export in progress, the newest one and when it goes, or what pressing does.
  const pebble = building ? { title: "I'm gathering every record into one file.", body: "You can leave this page. It waits here for seven days once it's ready." }
    : newest ? { title: `Your newest export is ready until ${exportDay(newest.expiresAt!)}.`, body: "Download it below, or press Download everything for a fresh one." }
    : { title: "I put every record in one file when you ask.", body: "It takes a few minutes. Your Systems keep running while I do it." };
  return <div className={styles.take}>
    <div className={styles.takeMain}>
      <XaHeadline quiet="Download it any time. If you leave, your site keeps working.">{businessName ? `${businessName} is yours.` : "Everything is yours."}</XaHeadline>
      <ul className={styles.contents} aria-label={manifest ? "Export manifest" : "What the file holds"}>
        {included.map(row => <li key={row.title} className={styles.content}><XaSystemTile kind={EXPORT_TILE[row.title] ?? "documents"} size={40} /><span className={styles.changeText}><span className={styles.changeTitle}>{row.title}</span><span className={styles.changeDetail}>{row.detail}</span></span>{row.count ? <span className={styles.contentEnd}>{row.count}</span> : <span />}</li>)}
        {domains.map(line => <li key={`domain:${line.siteName}`} className={styles.content}><span className={styles.globe} aria-hidden="true"><Globe size={20} strokeWidth={1.6} /></span><span className={styles.changeText}><span className={styles.changeTitle}>Your domain</span><span className={styles.changeDetail}>{line.done ? line.evidence ?? `${line.siteName}'s domain has moved where you chose.` : `${line.siteName}'s domain stays registered to you. Moving it is arranged with you; nothing changes until you say so.`}</span></span><span /></li>)}
      </ul>
      {!rows.length ? <p className={styles.quietNote}>No records were found in this export manifest.</p> : null}
      <div className={styles.takeActions}>
        <XaButton variant="primary" size="lg" busy={loading || building} disabled={building || schema3 && (historyLoading || Boolean(historyError))} onClick={() => void download()}>{building ? "Preparing your file" : "Download everything"}</XaButton>
        <XaTextLink href={`/workspace/exit?workspaceId=${encodeURIComponent(workspaceId)}`}>Leave Strelva</XaTextLink>
      </div>
      {scopeNote ? <p className={styles.quietNote}>{scopeNote}</p> : null}
      {notice && !error ? <div role="status"><XaSays>{notice}</XaSays></div> : null}
      {failed ? <div role="alert"><XaSays links={historyError ? [<XaTextLink key="reload" onClick={() => { setHistoryLoading(true); setRefresh(value => value + 1); }}>Reload exports</XaTextLink>] : undefined}>{failed}</XaSays></div> : null}
      {schema3 ? <section className={styles.history} aria-label="Recent exports">
        <XaLabel>Recent exports</XaLabel>
        {historyLoading ? <p role="status" className={styles.quietNote}>Looking for your exports…</p> : historyError ? null : !exports.length ? <p className={styles.quietNote}>None yet. Press Download everything and it appears here.</p> : <XaRows label="Export history">{exports.map(row => <XaRow key={row.buildId}
          title={`Export from ${exportDate(row.createdAt)}`}
          detail={row.status === "ready" ? `Download until ${exportDate(row.expiresAt!)}` : row.status === "building" ? "Being prepared" : row.status === "expired" ? "Expired" : "Didn't finish. Press Download everything to try again."}
          tone={row.status === "failed" || row.status === "stalled" ? "waits" : undefined}
          action={row.status === "ready" ? <XaButtonLink size="sm" href={`/api/workspace-export/v3/owner-download?build=${encodeURIComponent(row.buildId)}`}>Download</XaButtonLink> : undefined}
        />)}</XaRows>}
      </section> : null}
      {left.length ? <section className={styles.history} aria-label="Left out on purpose"><XaLabel>Left out on purpose</XaLabel><XaAnswers labelWidth={220} rows={left.map(row => [row.title, row.detail] as const)} /></section> : null}
    </div>
    <aside className={styles.takeSide} aria-label="What downloading does">
      <XaPebbleScene pose={building ? "fixing" : "resting"} size={320} label={building ? "Pebble gathering your records" : "Pebble beside your bookings calendar"} />
      <div role={building ? "status" : undefined}><h2>{pebble.title}</h2><p>{pebble.body}</p></div>
    </aside>
  </div>;
}

function exportDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

function exportDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}
