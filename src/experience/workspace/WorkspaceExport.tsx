"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { StEmpty, StHead, StLabel, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSplit, StSteps, StTextButton } from "@/components/ui/strelva/Kit";

import { ownerExportHistorySchema, type OwnerExportHistory } from "@/platform/workspace-exports/history-contracts";

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
  { title: "Passwords and connection tokens", detail: "Credentials stay out of the export.", included: false },
  { title: "Booking management links", detail: "These links are credentials.", included: false },
  { title: "Strelva’s internal notes", detail: "Strelva’s own records.", included: false },
  { title: "Records never imported", detail: "Export these from the provider that holds them.", included: false },
];
const LEGACY_SCOPE: ExportManifestRow[] = [
  { title: "Workspace and saved results", detail: "Current identity, supported records, releases, onboarding and economics receipts.", included: true },
  { title: "Uploads", detail: "Size, digest, extraction status and authenticated download references; uploaded bytes stay out of the JSON.", included: true },
  { title: "Sites and outside services", detail: "Managed-site content, calendars, inquiries, agency handover and Internal tool artifacts are outside this snapshot.", included: false },
  { title: "Credentials and internal records", detail: "Passwords, access tokens, command digests and internal learning stay out.", included: false },
];

type ExportProps = { workspaceId: string; schema3?: boolean; request?: typeof fetch; businessName?: string; manifest?: ExportManifestRow[] };

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
          setNotice(current.status === "ready" ? "Your business export is ready. Download it below." : "This export did not finish or has expired. Prepare a new export.");
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
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "The workspace export could not be created."); }
      if (response.status === 202) {
        const body = await response.json() as { buildId?: string; message?: string };
        if (!body.buildId || !/^[0-9a-f-]{36}$/.test(body.buildId)) throw new Error("The export build could not be confirmed. Reload before trying again.");
        setPendingBuild(body.buildId); setNotice(body.message || "Your export is being prepared."); return;
      }
      const blob = await response.blob();
      const match = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = match?.[1] || "workspace-export.json"; link.click(); URL.revokeObjectURL(link.href);
      setNotice("Workspace JSON prepared. The export action was recorded without storing its contents.");
    } catch (cause) {
      setError(true); setNotice(cause instanceof Error ? cause.message : "The workspace export could not be created.");
      // A lost POST response may still have started a build. Recover before retrying.
      if (schema3) { setHistoryLoading(true); setRefresh(value => value + 1); }
    }
    finally { setLoading(false); }
  }
  const rows = manifest ?? (schema3 ? SCHEMA_3_SCOPE : LEGACY_SCOPE);
  return <StPage>
    <StHead crumb={{ label: "Business details", href: `/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}` }} title={businessName ? `Export ${businessName}` : "Export your business"} meta={schema3 ? "One file you can open anywhere · schema 3 · nothing changes or stops" : "A bounded workspace snapshot · nothing changes or stops"} />
    <StSplit aside={<div className="flex min-w-0 flex-col gap-5">
        <StLabel>{building ? "Running now" : "Your export"}</StLabel>
        <StSteps label="Export progress" steps={[{ title: "Prepare business records", state: exports.some(row => row.status === "ready") ? "done" : building || loading ? "active" : "pending" }, { title: "Download archive", state: "pending" }]} />
        <p className="text-[13px] leading-5 text-gray-muted">{schema3 ? "Large exports run in the background. Return here to download yours for seven days. Email delivery may be paused." : "The file includes the supported records stored in this workspace. It does not end service or delete anything."}</p>
        <StPill busy={loading} disabled={building || schema3 && (historyLoading || Boolean(historyError))} onClick={() => void download()}>{schema3 ? "Prepare business export" : "Download workspace JSON"}</StPill>
        {notice ? <div role={error ? undefined : "status"}><StNotice tone={error ? "critical" : undefined}>{notice}</StNotice></div> : null}
        <StTextButton href={`/workspace/exit?workspaceId=${encodeURIComponent(workspaceId)}`}>Prepare to leave this workspace</StTextButton>
      </div>}>
      <div className="min-w-0">
        {schema3 ? <section className="mb-8" aria-label="Recent exports">
          <StLabel>Recent exports</StLabel>
          {historyLoading ? <p role="status" className="mt-3 text-[13px] leading-5 text-gray-muted">Loading your exports…</p> : historyError ? <div className="mt-3"><StNotice tone="critical">{historyError}</StNotice><StTextButton onClick={() => { setHistoryLoading(true); setRefresh(value => value + 1); }}>Reload exports</StTextButton></div> : !exports.length ? <StEmpty>No recent exports. Prepare one to download your business records.</StEmpty> : <StRows label="Export history">{exports.map(row => <StRow key={row.buildId}
            title={`Business export · ${exportDate(row.createdAt)}`}
            detail={row.status === "ready" ? `Ready · Download until ${exportDate(row.expiresAt!)}` : row.status === "building" ? "Being prepared. You can leave and return here." : row.status === "expired" ? "Expired. Prepare a new export." : row.status === "stalled" ? "Preparation stopped. Prepare a new export." : "Preparation failed. Prepare a new export."}
            end={row.status === "ready" ? <StPillLink href={`/api/workspace-export/v3/owner-download?build=${encodeURIComponent(row.buildId)}`}>Download business archive</StPillLink> : undefined}
          />)}</StRows>}
        </section> : null}
        <StRows label={manifest ? "Export manifest" : "Export scope"}>{rows.map(row => <StRow key={row.title} lead={row.included ? <Check size={14} className="text-positive" aria-hidden="true" /> : <Minus size={14} className="text-gray-muted" aria-hidden="true" />} title={row.title} detail={row.detail} value={row.count ? <StMono>{row.count}</StMono> : undefined} />)}</StRows>
        {!rows.length ? <StEmpty>No records were found in this export manifest.</StEmpty> : null}
        {!manifest ? <p className="mt-3 text-[13px] leading-5 text-gray-muted">{schema3 ? "The downloaded manifest lists actual counts and names anything unavailable. Counts are not available on this page." : "Exports above 2 MB stop without creating a partial file or success receipt. Unknown costs remain unknown."}</p> : null}
      </div>

    </StSplit>
  </StPage>;
}

function exportDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
