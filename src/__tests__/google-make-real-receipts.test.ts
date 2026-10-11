import { describe, expect, it, vi } from "vitest";
import { readGoogleMakeRealReceipt } from "@/products/google-listing/make-real-receipts";
import type { ListingReceipt } from "@/products/google-listing/contracts";
const rootKey="google-draft:event";
const receipt=(id:string,status:ListingReceipt["status"],key=rootKey): ListingReceipt=>({
 id,status,idempotencyKey:key,intentDigest:"approved-intent",workspaceId:"workspace",bindingId:"binding",locationId:"location",action:"hours_patch",targetRef:"location",authority:{kind:"owner_approval",actor:"owner"},before:{hours:"old"},after:{hours:"new"},undoesReceiptId:null, readback:null,providerRef:null,undo:null,undoneByReceiptId:null,error:null,createdAt:"2026-10-08T00:00:00.000Z",updatedAt:"2026-10-08T00:00:00.000Z",completedAt:null,
});
describe("Make Real receipt recovery",()=>{
 it.each(["posted","posting","posted_unverified","held_by_google"] as const)("recovers %s retry after a failed root without dispatch",async status=>{
  const root=receipt("root","failed"); const terminal=receipt("retry",status,`${rootKey}:retry:root`);
  const read=vi.fn(async key=>key===rootKey?root:key===terminal.idempotencyKey?terminal:null);
  expect(await readGoogleMakeRealReceipt(rootKey,read)).toBe(terminal);
  expect(read).toHaveBeenCalledTimes(2);
 });
 it.each(["workspaceId","bindingId","locationId","action","targetRef","authority","intentDigest","undoesReceiptId"])("refuses changed %s in retry intent",async field=>{
  const root=receipt("root","failed");const next={...receipt("retry","posted",`${rootKey}:retry:root`),[field]:"changed"};
  await expect(readGoogleMakeRealReceipt(rootKey,async key=>key===rootKey?root:next as ListingReceipt)).rejects.toThrow(/identity/);
 });
 it("recovers readback changes while retaining the original intent digest",async()=>{
  const root=receipt("root","failed");const next={...receipt("retry","posted",`${rootKey}:retry:root`),after:{hours:"Google readback"}};
  expect(await readGoogleMakeRealReceipt(rootKey,async key=>key===rootKey?root:next)).toBe(next);
 });
 it("refuses an unqualified legacy retry rather than dispatching again",async()=>{
  const root={...receipt("root","failed"),intentDigest:null};
  await expect(readGoogleMakeRealReceipt(rootKey,async key=>key===rootKey?root:receipt("retry","posted",`${rootKey}:retry:root`))).rejects.toThrow(/identity/);
 });
 it("walks at most the executor's twenty retries",async()=>{
  const read=vi.fn(async key=>receipt(String(read.mock.calls.length),"failed",key));
  await readGoogleMakeRealReceipt(rootKey,read);
  expect(read).toHaveBeenCalledTimes(21);
 });
});
