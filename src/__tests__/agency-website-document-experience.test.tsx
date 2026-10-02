// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyWebsiteDocumentDraftExperience, agencyDocumentTransport, AgencyDocumentTransportError, type AgencyDocumentTransport } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";
import AgencyManagedWebsiteDraftPage from "@/app/agency-websites/[bindingId]/page";
import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";
import { agencyDocumentFixture } from "@/experience/agency-website/agency-document-fixture";

let root: Root | undefined;
let container: HTMLDivElement;
const bindingId = "11111111-1111-4111-8111-111111111111";
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function mount(transport: AgencyDocumentTransport) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => { root!.render(createElement(AgencyWebsiteDocumentDraftExperience,{bindingId,transport})); }); }
function button(label: string) { return [...container.querySelectorAll("button")].find(value => value.textContent?.trim() === label)!; }
async function change(field: HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,value); field.dispatchEvent(new Event("input",{bubbles:true})); }); }
describe("agency v2 document drafts", () => {
  it("edits only accepted sections and sends controlled props plus section order", async () => {
    const initial = agencyDocumentFixture();
    const save = vi.fn(async (_binding,record) => ({website:record}));
    await mount({read:async()=>initial,save});
    const options = [...container.querySelectorAll("option")].map(option=>option.textContent);
    expect(options.join()).toContain("ServiceGrid");
    expect(options.join()).not.toContain("Header");
    expect(options.join()).not.toContain("Hero");
    expect(container.textContent).not.toContain("Approve this preview");
    expect(container.textContent).not.toContain("Connect domain");
    await change(container.querySelector("textarea")!,"[Agency's proposed services]");
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Move service-one down"]')!.click());
    await act(async()=>button("Save draft for customer review").click());
    expect(save).toHaveBeenCalledWith(bindingId,initial.website,"services",[
      {op:"replace",path:"/nodes/services/props",value:{...initial.website!.rebuild.candidate!.document.nodes.services!.props,title:"[Agency's proposed services]"}},
      {op:"replace",path:"/nodes/services/children",value:["service-two","service-one"]},
    ]);
    expect(container.textContent).toContain("The customer can now review it");
  });
  it.each(["agency-expired","agency-revoked","agency-no-permission"])("withholds editing for %s",async scenario=>{
    const initial=agencyDocumentFixture(scenario); const save=vi.fn();
    await mount({read:async()=>initial,save});
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(button("Save draft for customer review")).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });
  it("preserves edits after stale revision failure and reloads revoked permission",async()=>{
    const initial=agencyDocumentFixture();let reads=0;
    await mount({read:async()=>++reads===1?initial:agencyDocumentFixture("agency-revoked"),save:async()=>{throw new Error("This website changed. Reload before preparing a draft.");}});
    await change(container.querySelector("textarea")!,"[Keep this unsaved proposal]");
    await act(async()=>button("Save draft for customer review").click());
    expect(container.querySelector("textarea")!.value).toBe("[Keep this unsaved proposal]");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Your unsaved edits are preserved");
    await act(async()=>button("Reload saved document and permission").click());
    expect(container.textContent).toContain("permission is revoked");
    expect(container.querySelector("textarea")).toBeNull();
  });
  it("navigates grant-bound preview pages without discarding unsaved edits",async()=>{
    const initial=agencyDocumentFixture();initial.previewHref=`/api/agency-website-draft-access?document=preview&bindingId=${bindingId}&websiteWorkId=${bindingId}&section=services&revision=1&contentHash=${"a".repeat(64)}`;
    await mount({read:async()=>initial,save:vi.fn()});
    await change(container.querySelector("textarea")!,"[Unsaved section proposal]");
    const select=Array.from(container.querySelectorAll("select")).find(value=>value.querySelector('option[value="/service-one"]'))!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")!.set!.call(select,"/service-one");select.dispatchEvent(new Event("change",{bubbles:true}));});
    const url=new URL(container.querySelector("iframe")!.src);
    expect(url.searchParams.get("page")).toBe("/service-one");expect(url.searchParams.get("contentHash")).toBe("a".repeat(64));
    expect(container.querySelector("textarea")!.value).toBe("[Unsaved section proposal]");
    expect(container.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-same-origin");
  });
  it("shows failed private preview access and removes saving after grant recheck fails",async()=>{
    const initial=agencyDocumentFixture();initial.previewHtml="<html><body>Expired permission</body></html>";let reads=0;
    await mount({read:async()=>{if(++reads>1)throw new AgencyDocumentTransportError("Grant expired",403);return initial;},save:vi.fn()});
    await act(async()=>container.querySelector("iframe")!.dispatchEvent(new Event("load")));
    expect(container.textContent).toContain("The private preview is unavailable");
    await act(async()=>button("Reload preview and permission").click());
    expect(container.textContent).toContain("Grant expired");expect(button("Save draft for customer review")).toBeUndefined();
  });
  it.each(["read","save"] as const)("handles a followed sign-in redirect during %s as lost permission",async method=>{
    const response=new Response("<!doctype html><h1>Sign in</h1>",{status:200,headers:{"Content-Type":"text/html"}});
    Object.defineProperties(response,{redirected:{value:true},url:{value:"http://localhost/sign-in?next=%2Fagency-websites"}});
    vi.stubGlobal("fetch",vi.fn(async()=>response));
    const record=agencyDocumentFixture().website!;
    const request=method==="read"?agencyDocumentTransport.read(bindingId):agencyDocumentTransport.save(bindingId,record,"services",[{op:"replace",path:"/nodes/services/props/title",value:"Proposal"}]);
    await expect(request).rejects.toMatchObject({status:401,requiresPermissionReload:true,message:expect.stringContaining("Sign in again")});
  });
  it.each([
    ["HTML",()=>new Response("<h1>Unexpected HTML</h1>",{headers:{"Content-Type":"text/html"}})],
    ["invalid JSON",()=>new Response("{broken",{headers:{"Content-Type":"application/json"}})],
    ["incomplete JSON",()=>new Response("{}",{headers:{"Content-Type":"application/json"}})],
  ] as const)("rejects successful %s responses for both discovery and save",async(_label,response)=>{
    vi.stubGlobal("fetch",vi.fn(async()=>response()));
    const record=agencyDocumentFixture().website!;
    await expect(agencyDocumentTransport.read(bindingId)).rejects.toMatchObject({status:502,requiresPermissionReload:true});
    await expect(agencyDocumentTransport.save(bindingId,record,"services",[{op:"replace",path:"/nodes/services/props/title",value:"Proposal"}])).rejects.toMatchObject({status:502,requiresPermissionReload:true});
  });
  it.each(["sign-in redirect","invalid successful response"])("withholds saving and preserves a proposed edit after %s",async scenario=>{
    const initial=agencyDocumentFixture();
    vi.stubGlobal("fetch",vi.fn(async()=>{
      const response=new Response(scenario==="sign-in redirect"?"<h1>Sign in</h1>":"{}",{headers:{"Content-Type":scenario==="sign-in redirect"?"text/html":"application/json"}});
      if(scenario==="sign-in redirect")Object.defineProperties(response,{redirected:{value:true},url:{value:"http://localhost/sign-in"}});
      return response;
    }));
    await mount({read:async()=>initial,save:agencyDocumentTransport.save});
    await change(container.querySelector("textarea")!,"[Preserve my proposed edit]");
    await act(async()=>button("Save draft for customer review").click());
    expect(button("Save draft for customer review")).toBeUndefined();
    expect(container.textContent).toContain("Your unsaved edits are preserved");
    expect(container.textContent).toContain("Reloading replaces them with the saved document");
    expect(initial.website!.rebuild.candidate!.document.nodes.services!.props).toMatchObject({title:"Practice areas"});
    const fetchMock=vi.mocked(fetch);const request=fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(String(request.body)).ops[0].value.title).toBe("[Preserve my proposed edit]");
    expect(container.textContent).toContain("permission is unconfirmed");
  });
  it("accepts the disabled discovery response as a legacy binding",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({grant:null,website:null,section:null,sections:[],previewHtml:null,previewHref:null,notEnabled:true}),{headers:{"Content-Type":"application/json"}})));
    await expect(agencyDocumentTransport.read(bindingId)).resolves.toMatchObject({grant:null,website:null,section:null,sections:[]});
  });
  it("carries exact candidate identity and accepted section over the real transport",async()=>{
    const initial=agencyDocumentFixture();const ops=[{op:"replace" as const,path:"/nodes/services/props/title",value:"Proposal"}];
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:"Stale identity"}),{status:409}));vi.stubGlobal("fetch",fetchMock);
    await expect(agencyDocumentTransport.save(bindingId,initial.website!,"services",ops)).rejects.toThrow("Stale identity");
    const init=(fetchMock.mock.calls[0] as unknown as [string,RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({action:"prepare_document",bindingId,section:"services",websiteWorkId:initial.website!.workId,expectedRevision:1,candidateRevision:1,candidateContentHash:"a".repeat(64),ops});
  });
  it("bypasses document discovery and preserves the legacy surface when the release is disabled",async()=>{
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE","1"); vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE","0");
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const element=await AgencyManagedWebsiteDraftPage({params:Promise.resolve({bindingId})});
    expect(element.type).toBe(AgencyManagedWebsiteDraftExperience);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("explains the owner limitation for governance-blocked navigation scopes",async()=>{
    const initial=agencyDocumentFixture();initial.section="navigation";initial.sections=["navigation"];
    await mount({read:async()=>initial,save:vi.fn()});
    expect(container.textContent).toContain("Navigation and footer changes need the customer or Strelva");
    expect(container.querySelector("textarea")).toBeNull();
    expect(button("Save draft for customer review")).toBeUndefined();
  });
  it("keeps the legacy section editor when the binding has no v2 document",async()=>{
    const initial=agencyDocumentFixture();
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({grant:initial.grant,state:{tenantId:"fixture",section:"hero",revision:0,data:{headline:"Legacy headline"},dataHash:"a".repeat(32)},customerWebsiteHref:null}))));
    await mount({read:async()=>({...initial,website:null}),save:vi.fn()});
    expect(container.querySelector<HTMLInputElement>('#managed-website-hero-headline')!.value).toBe("Legacy headline");
    expect(container.textContent).toContain("Prepare and save draft");
  });
});
