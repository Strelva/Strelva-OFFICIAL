import { describe, expect, it, vi } from "vitest";
import { paceGoogleWrites } from "@/products/google-listing/pacing";
import { classifyGoogleFailure, type GoogleListingClient } from "@/products/google-listing/client";

function fixture() {
  const updateReply = vi.fn().mockResolvedValue({ ok: true, data: { comment: "Approved" } });
  const base = { updateReply } as unknown as GoogleListingClient;
  const pacing = { limited: vi.fn(async (_key: string) => false), wait: vi.fn(async (_ms: number) => undefined) };
  return { updateReply, pacing, client: paceGoogleWrites(base, "fixture-workspace", "fixture-location", pacing) };
}
describe("Google rejected-write pacing", () => {
  it("backs off explicit 429 rejections, then stops on acceptance", async () => {
    const f = fixture();
    f.updateReply.mockResolvedValueOnce({ ok: false, kind: "rate_limited", status: 429, detail: "Quota exceeded" });
    expect((await f.client.updateReply({ accountId: "account", locationId: "location" }, "review", "Approved")).ok).toBe(true);
    expect(f.updateReply).toHaveBeenCalledTimes(2); expect(f.pacing.wait).toHaveBeenCalledWith(1000);
    expect(f.pacing.limited).toHaveBeenCalledWith("google-listing:fixture-workspace:fixture-location");
  });
  it("never repeats quota-zero, authorization rejection or uncertain writes", async () => {
    const f = fixture();
    for (const kind of ["setup_pending", "auth", "error"]) {
      f.updateReply.mockClear().mockResolvedValue({ ok: false, kind, status: 403, detail: "Rejected" });
      await f.client.updateReply({ accountId: "account", locationId: "location" }, "review", "Approved");
      expect(f.updateReply).toHaveBeenCalledTimes(1);
    }
    f.updateReply.mockClear().mockRejectedValue(new Error("Connection lost"));
    await expect(f.client.updateReply({ accountId: "account", locationId: "location" }, "review", "Approved")).rejects.toThrow("Connection lost");
    expect(f.updateReply).toHaveBeenCalledTimes(1); expect(f.pacing.wait).not.toHaveBeenCalled();
  });
  it("keeps a draft waiting when the profile budget cannot be acquired", async () => {
    const f = fixture(); f.pacing.limited.mockResolvedValue(true);
    expect(await f.client.updateReply({ accountId: "account", locationId: "location" }, "review", "Approved")).toMatchObject({ ok: false, kind: "rate_limited" });
    expect(f.updateReply).not.toHaveBeenCalled(); expect(f.pacing.wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
  });
  it("distinguishes an exhausted normal quota from quota-zero API access", () => {
    expect(classifyGoogleFailure(429, "Quota exceeded")).toBe("rate_limited");
    expect(classifyGoogleFailure(429, "Quota limit: 0")).toBe("setup_pending");
    expect(classifyGoogleFailure(403, "SERVICE_DISABLED")).toBe("setup_pending");
  });
});

it.each(["updateReply","deleteReply","patchLocation","createPost","deletePost"] as const)("rechecks authority after profile pacing before %s",async(method)=>{
 let valid=true;const raw=vi.fn(async()=>({ok:true,data:null}));
 const pacing={limited:vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),wait:vi.fn(async()=>{valid=false;})};
 const authorize=vi.fn(async()=>{if(!valid)throw new Error("revoked");});
 const client=paceGoogleWrites({[method]:raw} as unknown as GoogleListingClient,"workspace","location",pacing).withWriteAuthority!(authorize);
 const call=client[method] as (...args:unknown[])=>Promise<unknown>;
 expect(await call({accountId:"account",locationId:"location"},"target",{})).toMatchObject({ok:false,kind:"auth",status:403});
 expect(raw).not.toHaveBeenCalled();expect(authorize).toHaveBeenCalledTimes(1);
});
it("rechecks authority after definitive provider rejection and preserves accepted observations",async()=>{
 let valid=true;const raw=vi.fn(async()=>({ok:false,kind:"rate_limited",status:429,detail:"rate"}));
 const pacing={limited:async()=>false,wait:async()=>{valid=false;}};
 const authorize=vi.fn(async()=>{if(!valid)throw new Error("revoked");});
 const client=paceGoogleWrites({updateReply:raw} as unknown as GoogleListingClient,"workspace","location",pacing).withWriteAuthority!(authorize);
 expect(await client.updateReply({accountId:"account",locationId:"location"},"review","reply")).toMatchObject({ok:false,kind:"auth"});
 expect(raw).toHaveBeenCalledTimes(1);expect(authorize).toHaveBeenCalledTimes(2);
 valid=true;raw.mockImplementationOnce(async()=>{valid=false;return {ok:true,data:null} as never;});
 expect(await client.updateReply({accountId:"account",locationId:"location"},"review","reply")).toMatchObject({ok:true});
 expect(raw).toHaveBeenCalledTimes(2);expect(authorize).toHaveBeenCalledTimes(3);
});
