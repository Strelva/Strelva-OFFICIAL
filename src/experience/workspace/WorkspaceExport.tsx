"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { StEmpty, StHead, StLabel, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSplit, StSteps, StTextButton } from "@/components/ui/strelva/Kit";

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

export function WorkspaceExport({ workspaceId, schema3 = false, request = fetch, businessName, manifest }: { workspaceId: string; schema3?: boolean; request?: typeof fetch; businessName?: string; manifest?: ExportManifestRow[] }) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!buildId || ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await request(`/api/workspace-export/v3/status?build=${encodeURIComponent(buildId!)}`, { signal: controller.signal });
        const body = await response.json() as { status?: string; error?: string };
        if (!response.ok) throw new Error(body.error || "Export status could not be read. Try again.");
        if (controller.signal.aborted) return;
        if (body.status === "ready") { setReady(true); setError(false); setNotice("Your business export is ready. Download it below."); return; }
        if (body.status === "failed" || body.status === "expired" || body.status === "stalled") {
          setBuildId(null); setError(true); setNotice("This export did not finish or has expired. Prepare a new export."); return;
        }
        timer = setTimeout(() => void poll(), 3000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(true); setNotice(cause instanceof Error ? cause.message : "Export status could not be read.");
        timer = setTimeout(() => void poll(), 10000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [buildId, ready, request]);
  async function download() {
    setLoading(true); setNotice(""); setError(false);
    try {
      const response = await request(schema3 ? "/api/workspace-export/v3" : "/api/workspace-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "The workspace export could not be created."); }
      if (response.status === 202) {
        const body = await response.json() as { buildId?: string; message?: string };
        if (!body.buildId || !/^[0-9a-f-]{36}$/.test(body.buildId)) throw new Error("The export build could not be confirmed. Reload before trying again.");
        setReady(false); setBuildId(body.buildId); setNotice(body.message || "Your export is being prepared."); return;
      }
      const blob = await response.blob();
      const match = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = match?.[1] || "workspace-export.json"; link.click(); URL.revokeObjectURL(link.href);
      setNotice("Workspace JSON prepared. The export action was recorded without storing its contents.");
    } catch (cause) { setError(true); setNotice(cause instanceof Error ? cause.message : "The workspace export could not be created."); }
    finally { setLoading(false); }
  }
  const rows = manifest ?? (schema3 ? SCHEMA_3_SCOPE : LEGACY_SCOPE);
  return <StPage>
    <StHead crumb={{ label: "Business details", href: `/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}` }} title={businessName ? `Export ${businessName}` : "Export your business"} meta={schema3 ? "One file you can open anywhere · schema 3 · nothing changes or stops" : "A bounded workspace snapshot · nothing changes or stops"} />
    <StSplit aside={<div className="flex min-w-0 flex-col gap-5">
        <StLabel>{buildId && !ready ? "Running now" : ready ? "Ready to download" : "Your export"}</StLabel>
        <StSteps label="Export progress" steps={[{ title: "Prepare business records", state: error && buildId ? "failed" : ready ? "done" : buildId || loading ? "active" : "pending" }, { title: "Download archive", state: "pending" }]} />
        <p className="text-[13px] leading-5 text-gray-muted">{schema3 ? "Large exports run in the background. Return here to download yours for seven days. Email delivery may be paused." : "The file includes the supported records stored in this workspace. It does not end service or delete anything."}</p>
        {ready && buildId ? <StPillLink href={`/api/workspace-export/v3/owner-download?build=${encodeURIComponent(buildId)}`}>Download business archive</StPillLink> : <StPill busy={loading} disabled={Boolean(buildId)} onClick={() => void download()}>{schema3 ? "Prepare business export" : "Download workspace JSON"}</StPill>}
        {notice ? <div role={error ? undefined : "status"}><StNotice tone={error ? "critical" : undefined}>{notice}</StNotice></div> : null}
        <StTextButton href={`/workspace/exit?workspaceId=${encodeURIComponent(workspaceId)}`}>Prepare to leave this workspace</StTextButton>
      </div>}>
      <div className="min-w-0">
        <StRows label={manifest ? "Export manifest" : "Export scope"}>{rows.map(row => <StRow key={row.title} lead={row.included ? <Check size={14} className="text-positive" aria-hidden="true" /> : <Minus size={14} className="text-gray-muted" aria-hidden="true" />} title={row.title} detail={row.detail} value={row.count ? <StMono>{row.count}</StMono> : undefined} />)}</StRows>
        {!rows.length ? <StEmpty>No records were found in this export manifest.</StEmpty> : null}
        {!manifest ? <p className="mt-3 text-[13px] leading-5 text-gray-muted">{schema3 ? "The downloaded manifest lists actual counts and names anything unavailable. Counts are not available on this page." : "Exports above 2 MB stop without creating a partial file or success receipt. Unknown costs remain unknown."}</p> : null}
      </div>

    </StSplit>
  </StPage>;
}
