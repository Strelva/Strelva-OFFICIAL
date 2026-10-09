import { createDocument } from "@/products/documents/engine";
import { describe, expect, it } from "vitest";
import { createInvestigationService } from "@/products/investigations/server";
import { investigationSchema } from "@/products/investigations/contracts";
import type { InvestigationHistory, InvestigationRun } from "@/products/investigations/history";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

describe("standing-check durable history", () => {
 it("normalizes native PostgreSQL source timestamps before committing evidence",async()=>{
  const store=memoryBoundedStore();
  const sources=[];
  for(let i=0;i<2;i++) {
   const doc=await store.create(owner,"workspace-a",{productId:"documents",resourceKind:"document",title:"Native document",payload:createDocument({title:"Native document",text:"Same source"},owner.userId)});
   sources.push({workId:doc.id});
  }
  const read=store.read.bind(store);
  store.read=async(...args)=>{const row=await read(...args);return row?.productId==="documents"?{...row,updatedAt:"2026-10-08T23:38:48.423079+00:00"}:row;};
  const service=createInvestigationService(store);
  const work=await service.create(owner,"workspace-a",{title:"Native comparison",intervalMinutes:60,sources});
  const checked=await service.run(owner,work.id,{expectedRevision:0,requestId:"native-timestamp"},new Date(Date.now()+60*60_000));
  expect(checked.payload.runs[0].sources.map(source=>source.updatedAt)).toEqual(["2026-10-08T23:38:48.423Z","2026-10-08T23:38:48.423Z"]);
 });
 it("survives 501 runs, failures, restart and old-key retries without truncating complete evidence", async () => {
  const store = memoryBoundedStore();
  const rows: Array<{ revision: number; run: InvestigationRun }> = [];
  const original = store.update.bind(store);
  store.update = async (...args) => {
   const saved = await original(...args);
   const payload = investigationSchema.parse(saved.payload);
   const run = payload.runs.at(-1)!;
   rows.push({ revision: payload.revision, run });
   return saved;
  };
  const history: InvestigationHistory = {
   async find(_actor, _id, request) { return rows.find(row => row.run.requestId === request)?.run ?? null; },
   async page(_actor, _id, before, limit) { return rows.filter(row => before === null || row.revision < before).sort((a,b) => b.revision-a.revision).slice(0,limit); },
  };
  let denied = false;
  const readPublicWebsite = async () => denied
   ? { sourceUrl: "https://example.test/", observedAt: new Date().toISOString(), freshness: "unavailable" as const, status: "access_denied" as const, retryable: true }
   : { sourceUrl: "https://example.test/", observedAt: new Date().toISOString(), freshness: "fresh" as const, status: "available" as const, retryable: false, contentFingerprint: "a".repeat(64), fingerprint: "b".repeat(64), contentExcerpt: "Price", contentVisibility: "server_visible" as const };
  let service = createInvestigationService(store, { history, readPublicWebsite });
  let work = await service.create(owner,"workspace-a",{ title:"Standing check",intervalMinutes:15,mode:"public_website",sources:[{kind:"public_website",url:"https://example.test/"}] });
  for (let i=0;i<501;i++) {
   denied = i > 0 && i <= 300;
   if (i === 250) service = createInvestigationService(store,{ history,readPublicWebsite });
   work = await service.run(owner,work.id,{ expectedRevision:work.payload.revision,requestId:`run-${i}` },new Date(Date.now()+(i+1)*16*60_000));
  }
  expect(work.payload.runs).toHaveLength(200);
  expect(work.payload.history).toHaveLength(500);
  expect(rows).toHaveLength(501);
  expect(rows.filter(row => row.run.result === "unavailable")).toHaveLength(300);
  expect(work.payload.runs.at(-1)?.result).toBe("no_change");
  const replay = await service.run(owner,work.id,{ expectedRevision:0,requestId:"run-0" });
  expect(replay.payload.revision).toBe(501);
  let before: number | undefined;
  const complete: number[] = [];
  do {
   const page = await service.history(owner,work.id,{ beforeRevision:before,limit:100 });
   complete.push(...page.runs.map(row=>row.revision));
   before = page.nextBeforeRevision ?? undefined;
   if (page.nextBeforeRevision === null) break;
  } while (true);
  expect(complete).toHaveLength(501);
  expect(new Set(complete).size).toBe(501);
  expect(complete.at(-1)).toBe(1);
 });
});
