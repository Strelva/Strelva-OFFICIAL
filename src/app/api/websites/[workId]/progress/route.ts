import { readWebsiteRebuild } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request,context: { params: Promise<{ workId: string }> }) => rebuildHttp(request,context.params,false,async(actor,id) => {
  const record = await readWebsiteRebuild(actor,id);
  const data = `id: ${record.rebuild.revision}\nevent: progress\ndata: ${JSON.stringify(record)}\n\n`;
  // A finite SSE snapshot reconnects with fresh authorization every time.
  // There is no immortal stream retaining access after membership revocation.
  return new Response(`retry: 1500\n${data}`,{ headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
});
