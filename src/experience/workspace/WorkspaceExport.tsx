"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function WorkspaceExport({ workspaceId }: { workspaceId: string }) {
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState("");
  async function download() {
    setLoading(true); setNotice("");
    try {
      const response=await fetch("/api/workspace-export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId})});
      if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:string};throw new Error(body.error||"The workspace export could not be created.");}
      const blob=await response.blob();
      const match=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=match?.[1]||"workspace-export.json"; link.click(); URL.revokeObjectURL(link.href);
      setNotice("Workspace JSON prepared. The export action was recorded without storing its contents.");
    } catch(cause){setNotice(cause instanceof Error?cause.message:"The workspace export could not be created.");}
    finally{setLoading(false);}
  }
  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8 lg:px-12"><div className="mx-auto max-w-[760px]"><a className="text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}>Back to People &amp; access</a><p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace portability</p><h1 className="mt-3 font-display text-[40px] font-medium leading-tight">Download current workspace data</h1><p className="mt-4 max-w-2xl text-base leading-7 text-gray-muted">This owner-only JSON includes saved results, native application releases and records, and local economics receipts. Unknown costs remain unknown.</p><Card padding="lg" className="mt-8"><h2 className="text-lg font-medium">A bounded snapshot</h2><ul className="mt-4 grid gap-3 text-sm leading-6 text-gray-muted"><li>Includes current workspace identity and supported portable records.</li><li>Excludes credentials, access tokens, command digests, provider handover, managed-site content, and internal learning.</li><li>Does not close an account, delete work, end service, or set a retention period.</li><li>Exports above 2 MB stop without creating a partial file or success receipt.</li></ul><Button className="mt-7" size="lg" loading={loading} onClick={()=>void download()} icon={loading?<Loader2 className="size-4"/>:<Download className="size-4"/>}>Download workspace JSON</Button>{notice?<p role="status" className="mt-5 text-sm text-gray-muted">{notice}</p>:null}</Card></div></main>;
}
