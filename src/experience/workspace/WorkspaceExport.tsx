"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function WorkspaceExport({ workspaceId, schema3 = false, request = fetch }: { workspaceId: string; schema3?: boolean; request?: typeof fetch }) {
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState("");
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
        if (body.status === "ready") { setReady(true); setNotice("Your business export is ready. Download it below."); return; }
        if (body.status === "failed" || body.status === "expired" || body.status === "stalled") {
          setBuildId(null); setNotice("This export did not finish or has expired. Prepare a new export."); return;
        }
        timer = setTimeout(() => void poll(), 3000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setNotice(cause instanceof Error ? cause.message : "Export status could not be read.");
        timer = setTimeout(() => void poll(), 10000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [buildId, ready, request]);
  async function download() {
    setLoading(true); setNotice("");
    try {
      const response=await request(schema3 ? "/api/workspace-export/v3" : "/api/workspace-export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId})});
      if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:string};throw new Error(body.error||"The workspace export could not be created.");}
      if (response.status === 202) {
        const body = await response.json() as { buildId?: string; message?: string };
        if (!body.buildId || !/^[0-9a-f-]{36}$/.test(body.buildId)) throw new Error("The export build could not be confirmed. Reload before trying again.");
        setReady(false); setBuildId(body.buildId); setNotice(body.message || "Your export is being prepared."); return;
      }
      const blob=await response.blob();
      const match=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=match?.[1]||"workspace-export.json"; link.click(); URL.revokeObjectURL(link.href);
      setNotice("Workspace JSON prepared. The export action was recorded without storing its contents.");
    } catch(cause){setNotice(cause instanceof Error?cause.message:"The workspace export could not be created.");}
    finally{setLoading(false);}
  }
  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8 lg:px-12"><div className="mx-auto max-w-[760px]">
    <a className="text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}>Back to People &amp; access</a>
    <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace portability</p>
    <h1 className="mt-3 font-display text-[40px] font-medium leading-tight">{schema3 ? "Take your business records with you" : "Download current workspace data"}</h1>
    <p className="mt-4 max-w-2xl text-base leading-7 text-gray-muted">{schema3 ? "Prepare one archive of your business, Systems, linked sites, customer records, and billing state. Its manifest names anything unavailable. Unknown costs remain unknown." : "This owner-only JSON includes saved results, application releases and records, onboarding cases, and economics receipts. Unknown costs remain unknown."}</p>
    <Card padding="lg" className="mt-8">
      <h2 className="text-lg font-medium">{schema3 ? "Your complete stored record" : "A bounded snapshot"}</h2>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-gray-muted">
        {schema3 ? <><li>Includes business facts, Systems and Version history, linked-site content, inquiries, bookings, orders, rewards, settings, and billing records stored by Strelva.</li><li>Media and onboarding uploads include download references. Provider records Strelva has never imported remain with that provider.</li><li>Passwords, connection tokens, card details, booking management links, and Strelva’s internal notes are excluded.</li><li>Large archives are prepared in the background. The owner can download the archive here for seven days, even while email is paused.</li><li>This export does not end service or delete records. Prepare an exit separately to review billing, sites, agency handover, and retained history.</li></> : <>
          <li>Includes current workspace identity and supported portable records.</li>
          <li>Onboarding uploads are represented by size, digest, extraction status, and an authenticated download reference. Uploaded bytes stay out of the JSON file.</li>
          <li>Custom application source and artifacts, calendar connections and event receipts, inquiry and follow-up records, and offering/agency records are outside this snapshot.</li>
          <li>Credentials, access tokens, command digests, agency handover, managed-site content, and internal learning are excluded.</li>
          <li>Does not close an account, delete work, end service, or set a retention period. Exports above 2 MB stop without creating a partial file or success receipt.</li>
        </>}
      </ul>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        {ready && buildId ? <a className="rounded-full bg-warm-black px-6 py-3 text-sm font-medium text-white" href={`/api/workspace-export/v3/owner-download?build=${encodeURIComponent(buildId)}`}>Download business archive</a> : <Button size="lg" loading={loading} disabled={Boolean(buildId)} onClick={()=>void download()} icon={loading?<Loader2 className="size-4"/>:<Download className="size-4"/>}>{schema3 ? "Prepare business export" : "Download workspace JSON"}</Button>}
        <a className="text-sm font-medium text-warm-black underline-offset-4 hover:underline" href={`/workspace/exit?workspaceId=${encodeURIComponent(workspaceId)}`}>Prepare to leave this workspace</a>
      </div>
      {notice?<p role="status" className="mt-5 text-sm text-gray-muted">{notice}</p>:null}
    </Card>
  </div></main>;
}
