// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { InquiryRecordsError, setInquiryRecordsDb } from "@/platform/infra/inquiry-records";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readOperatorInquiryReview } from "@/platform/operator-queue/inquiry-review";
import { OperatorInquiryActions } from "@/app/admin/client-leads/inquiries/OperatorInquiryActions";
import { OperatorInquiryReview } from "@/app/admin/client-leads/inquiries/OperatorInquiryReview";

const actor = { userId: "ca500000-0000-4000-8000-000000000001", verifiedEmail: "review-op@example.test" };
const row = { id: "ca500000-0000-4000-8000-000000000020", workspaceId: null, businessName: "Fixture business", tenantId: "fixture", connectedSiteId: null,
  leadId: "lead_review", name: "Dana", email: "dana@example.test", message: "A private party for 30?", capturedAt: "2026-10-06T12:00:00Z", intakeState: "held_as_spam" as const, heldReason: "Spam signal" };
const rpc = vi.fn();
const roots: ReturnType<typeof createRoot>[] = [];
async function render(element: ReactElement) { const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(element)); return node; }
async function click(node: HTMLElement, name: string) { const button = [...node.querySelectorAll("button")].find(button => button.textContent === name); expect(button).toBeTruthy(); await act(async () => button!.click()); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); rpc.mockReset(); setInquiryRecordsDb({ rpc }); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("DUAL_WRITE_PG", "1"); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML=""; setInquiryRecordsDb(undefined); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("operator inquiry records", () => {
  it("makes no read while the relevant flag is off", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "0"); vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0");
    expect((await readOperatorInquiryReview(actor,"held")).state).toBe("off");
    expect((await readOperatorInquiryReview(actor,"notices")).state).toBe("off"); expect(rpc).not.toHaveBeenCalled();
  });
  it("requests a bounded exact cursor and verified operator identity without membership", async () => {
    rpc.mockResolvedValue({ data: Array.from({length:51},(_,i) => ({...row,id:`ca500000-0000-4000-8000-${String(i).padStart(12,"0")}`})), error:null });
    const result = await readOperatorInquiryReview(actor,"held","2026-10-07T00:00:00Z",row.id);
    expect(result.held).toHaveLength(50); expect(result.next).toMatchObject({at:row.capturedAt});
    expect(rpc).toHaveBeenCalledWith("read_operator_held_inquiries",expect.objectContaining({p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_limit:51,p_before_id:row.id,p_state:"held_as_spam"}));
  });
  it("refuses a SQL access denial and preserves failed/malformed storage as an error", async () => {
    rpc.mockResolvedValueOnce({data:null,error:{message:"inquiry_access_denied"}});
    await expect(readOperatorInquiryReview(actor,"held")).rejects.toBeInstanceOf(WorkspaceAccessError);
    rpc.mockResolvedValueOnce({data:null,error:{message:"db unavailable"}});
    await expect(readOperatorInquiryReview(actor,"held")).rejects.toBeInstanceOf(InquiryRecordsError);
    rpc.mockResolvedValueOnce({data:[{...row,id:"invalid"}],error:null});
    await expect(readOperatorInquiryReview(actor,"held")).rejects.toThrow("inquiry_operator_read_malformed");
  });
  it("renders held records, empty, unavailable, loading, denied and off states honestly", () => {
    for (const state of ["ready","unavailable","loading","denied","off"] as const) {
      const html = renderToStaticMarkup(<OperatorInquiryReview load={{state,held:state==="ready"?[row]:[],notices:[],next:null}} view="held" recordsOpen noticesOpen />);
      expect(html).toContain(state==="ready"?"Dana":state==="unavailable"?"could not be read":state==="loading"?"Reading inquiry":state==="denied"?"Only Strelva operators":"not enabled");
      if(state!=="ready") expect(html).not.toContain("Not spam, release it");
    }
    expect(renderToStaticMarkup(<OperatorInquiryReview load={{state:"ready",held:[],notices:[],next:null}} view="held" recordsOpen noticesOpen />)).toContain("No messages in this review state");
  });
  it("releases through the operator route and reports that nobody was emailed", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({status:"decided",state:"released"}),{status:200})); vi.stubGlobal("fetch",fetch);
    const node=await render(<OperatorInquiryActions rowId={row.id} state="held_as_spam" />); await click(node,"Not spam, release it");
    expect(node.querySelector('[role="status"]')?.textContent).toContain("Nobody was emailed");
    expect(fetch).toHaveBeenCalledWith("/api/admin/client-leads/held",expect.objectContaining({body:JSON.stringify({rowId:row.id,decision:"release"})}));
  });
  it("keeps a refused notice repair visible and never describes suppression as delivery", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({status:"paused",reason:"correct_owner_recipient_before_resending"}),{status:200})));
    const node=await render(<OperatorInquiryActions notice={{tenantId:"fixture",inquiryId:"lead_review"}} />);
    await click(node,"Send to corrected owner");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Repair refused");
    expect(node.querySelector("button")).toBeTruthy();
  });
  it("routes connected repair by durable row id and fails closed on transport or permission errors", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({error:"Forbidden"}),{status:403})); vi.stubGlobal("fetch",fetch);
    const node=await render(<OperatorInquiryActions notice={{rowId:row.id}} />); await click(node,"Send to corrected owner");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Operator access is required");
    expect(fetch).toHaveBeenCalledWith("/api/admin/client-leads/connected-owner-notice",expect.objectContaining({body:JSON.stringify({rowId:row.id})}));
  });
});
