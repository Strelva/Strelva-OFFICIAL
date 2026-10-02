import { workspaceJson } from "@/platform/workspaces/http";
import { readWebsiteRebuild } from "@/products/websites/index";
import { websiteDocumentStore } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const GET = (request: Request,context: { params: Promise<{ workId: string }> }) => rebuildHttp(request,context.params,false,async(actor,id) => {
  const record = await readWebsiteRebuild(actor,id);
  const key={workspaceId:record.workspaceId,workId:id};
  const [rows,receipts]=await Promise.all([websiteDocumentStore.list(actor,key),websiteDocumentStore.receipts(actor,key)]);
  const published=new Set(receipts.filter(receipt=>receipt.status==="published").map(receipt=>`${receipt.candidateRevision}:${receipt.artifactHash}`));
  return workspaceJson({ currentRevision: record.rebuild.candidate?.revision ?? null, revisions: rows.map(row => ({ revision: row.revision, contentHash: row.contentHash, createdAt: row.createdAt, published: published.has(`${row.revision}:${row.contentHash}`) })) });
});
