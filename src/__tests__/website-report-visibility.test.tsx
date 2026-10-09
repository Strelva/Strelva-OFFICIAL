// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebsiteRebuildReport } from "@/experience/websites/WebsiteRebuildReport";
import type { WebsiteMonthlyReport } from "@/products/websites/client";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
const report = (): WebsiteMonthlyReport => ({
 workId:"website",workspaceId:"workspace",tenantId:"mooney",siteName:"The Mooney Firm",month:"2026-09",generatedAt:"2026-10-01T12:00:00Z",
 inquiries:{status:"available",count:2,limitedToRecentRecords:true},bookings:{status:"unavailable",scheduledInPeriod:null,providerAccepted:null,providerVerified:null},
 visibility:{status:"unavailable",note:"No completed assistant citation check was saved."},readiness:{status:"available",passedChecks:1,totalChecks:2},changes:[],
});
async function mount(value: WebsiteMonthlyReport) {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(value))));
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
 await act(async()=>{root!.render(createElement(WebsiteRebuildReport,{workId:"website"}));});
}
describe("website report citation presentation",()=>{
 it("shows readiness separately while the assistant check is not measured",async()=>{
  await mount(report());const citation=Array.from(container.querySelectorAll("dt")).find(row=>row.textContent==="Assistant citation check")!.parentElement!;
  expect(citation.querySelector("dd")?.textContent).toBe("Not measured");expect(citation.textContent).toContain("Website readiness checks: 1 of 2 passed");expect(citation.textContent).toContain("Readiness checks do not measure whether an assistant names the business");
 });
 it("shows a saved negative answer as not named, not as unavailable or a grade",async()=>{
  const value=report();value.visibility={status:"available",checkedAt:"2026-09-20T12:00:00Z",mentioned:false,recommended:false,note:"Gemini did not name The Mooney Firm in one saved answer."};
  await mount(value);const citation=Array.from(container.querySelectorAll("dt")).find(row=>row.textContent==="Assistant citation check")!.parentElement!;
  expect(citation.querySelector("dd")?.textContent).toBe("Not named in check");expect(citation.textContent).toContain("Not recommended in this saved check");expect(citation.textContent).toContain(value.visibility.note);
 });
});

it("keeps the full selected month described and queries that same month after a native picker change", async () => {
 await mount(report());
 const input = container.querySelector<HTMLInputElement>('input[type="month"]')!;
 const description = () => document.getElementById(input.getAttribute("aria-describedby")!);
 expect(description()?.textContent).toBe(`Selected month: ${input.value}`);
 expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain(`month=${input.value}`);
 input.focus(); expect(document.activeElement).toBe(input);
 await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-08");
  input.dispatchEvent(new Event("input", { bubbles: true }));
 });
 expect(input.type).toBe("month"); expect(input.value).toBe("2026-08");
 expect(description()?.textContent).toBe("Selected month: 2026-08");
 expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
 const [url, options] = vi.mocked(fetch).mock.calls[1]!;
 expect(new URL(String(url), "http://localhost").searchParams.get("month")).toBe("2026-08");
 expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin" });
 expect(options?.method).toBeUndefined();
});
