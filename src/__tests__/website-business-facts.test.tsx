import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bindWebsiteBusinessRecord, projectWebsiteBusinessFacts, type WebsiteBusinessFacts } from "@/products/websites/business-facts";
import { readHostedBusinessFacts } from "@/products/websites/business-facts-server";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";
import { SiteRenderer } from "@/products/websites/SiteRenderer";
const ports = vi.hoisted(() => ({ rpc: vi.fn(), released: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: ports.rpc }) }));
vi.mock("@/products/websites/rebuild-release", () => ({ websiteRebuildReleaseEnabledForTenant: ports.released }));
const document = () => siteDocumentSchema.parse({version:2,siteName:"Fictional bakery",theme:{palette:"light",typeScale:"standard"},pages:[{path:"/",title:"Bakery",description:"A local bakery",root:"root"}],
  nodes:{root:{id:"root",type:"Section",variant:"container",props:{},children:["header","hours","map","services","contact"]},header:{id:"header",type:"Header",variant:"logo-left",props:{brand:"Earlier bakery"}},hours:{id:"hours",type:"Hours",variant:"table",props:{rows:[{day:"Monday",hours:"Old hours"}]}},map:{id:"map",type:"Map",variant:"static",props:{address:"Earlier address"}},services:{id:"services",type:"ServiceGrid",variant:"cards",props:{items:[{title:"Earlier service"}]}},contact:{id:"contact",type:"Cta",variant:"band",props:{cta:{label:"Call us",href:"tel:7165550100"}}}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"}});
const record: WebsiteBusinessFacts = {revision:4,facts:{display_name:"Current bakery",phone:"7165550123",email:"hello@example.test",address:{formatted:"12 Fictional St"},hours:{timezone:"America/New_York",weekly:[{day:1,opens:"09:00",closes:"17:00"}]}},services:[{name:"Fresh bread",description:"Baked here",priceText:null}]};
beforeEach(() => {vi.clearAllMocks();vi.stubEnv("STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED","1");ports.released.mockResolvedValue(true);ports.rpc.mockResolvedValue({data:record,error:null});});
afterEach(() => vi.unstubAllEnvs());
describe("hosted websites read confirmed business facts", () => {
  it("flags off adds no bindings, reads no flags or storage and preserves the issued document", async () => {
    vi.stubEnv("STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED","0");const doc=document();expect(bindWebsiteBusinessRecord(doc,record)).toBe(doc);
    expect(await readHostedBusinessFacts("fictional")).toBeNull();expect(ports.released).not.toHaveBeenCalled();expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("requires this serving tenant's release and fails back to the issued copy on unavailable or malformed records", async () => {
    ports.released.mockResolvedValue(false);expect(await readHostedBusinessFacts("fictional")).toBeNull();expect(ports.rpc).not.toHaveBeenCalled();
    ports.released.mockResolvedValue(true);expect(await readHostedBusinessFacts("fictional")).toEqual(record);expect(ports.rpc).toHaveBeenCalledWith("read_hosted_website_business_facts",{p_tenant_id:"fictional"});
    ports.rpc.mockRejectedValue(Error("storage down"));expect(await readHostedBusinessFacts("fictional")).toBeNull();
    ports.rpc.mockResolvedValue({data:{...record,facts:{...record.facts,owner_recipient:{email:"private@example.test"}}},error:null});expect(await readHostedBusinessFacts("fictional")).toBeNull();
  });
  it("projects only declared catalog slots, keeping the original document, hash, navigation and provenance", () => {
    const doc=bindWebsiteBusinessRecord(document(),record);const snapshot=structuredClone(doc);const hash=siteDocumentHash(doc);
    const projected=projectWebsiteBusinessFacts(doc,record);expect(projected.nodes.header!.props).toMatchObject({brand:"Current bakery"});expect(projected.nodes.map!.props).toMatchObject({address:"12 Fictional St"});
    expect(projected.nodes.hours!.props).toMatchObject({rows:expect.arrayContaining([{day:"Monday",hours:"09:00–17:00"}])});expect(projected.nodes.contact!.props).toMatchObject({cta:{label:"Call us",href:"tel:7165550123"}});
    expect(projected.nodes.services!.props).toMatchObject({items:[{title:"Fresh bread",body:"Baked here"}]});expect(projected.facts).toEqual(snapshot.facts);expect(projected.pages).toEqual(snapshot.pages);
    expect(doc).toEqual(snapshot);expect(siteDocumentHash(doc)).toBe(hash);expect(projectWebsiteBusinessFacts(document(),record)).toEqual(document());expect(projectWebsiteBusinessFacts(doc,null)).toBe(doc);
  });
  it("renders the current record with its own revision while retaining the immutable publication checksum; private preview stays pinned", () => {
    const doc=bindWebsiteBusinessRecord(document(),record);const hash=siteDocumentHash(doc);const html=renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={record} contentHash={hash}/>);
    expect(html).toContain("Current bakery");expect(html).toContain("12 Fictional St");expect(html).toContain('name="strelva-business-record-revision" content="4"');expect(html).toContain(`name="strelva-site-hash" content="${hash}"`);
    const preview=renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={record} preview/>);expect(preview).toContain("Earlier bakery");expect(preview).not.toContain("strelva-business-record-revision");
    expect(() => renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={record} contentHash={"f".repeat(64)}/>)).toThrow("approved hash");
  });
  it("keeps the approved copy when a valid record exceeds the renderer's declared slot limits", () => {
    const doc=bindWebsiteBusinessRecord(document(),record);
    const overfull={...record,facts:{...record.facts,hours:{timezone:"America/New_York",weekly:Array.from({length:70},()=>({day:1,opens:"09:00",closes:"17:00"}))}}};
    expect(projectWebsiteBusinessFacts(doc,overfull)).toBe(doc);
    expect(renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={overfull}/>)).toContain("Earlier bakery");
    expect(renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={overfull}/>)).not.toContain("strelva-business-record-revision");
  });
  it("retains timezone and dated hour exceptions rather than publishing only the weekly schedule", () => {
    const doc=bindWebsiteBusinessRecord(document(),record);
    const holiday={...record,facts:{...record.facts,hours:{...record.facts.hours!,overrides:[{date:"2026-12-25",label:"Holiday",closed:true}]}}};
    const projected=projectWebsiteBusinessFacts(doc,holiday);
    expect(projected.nodes.hours!.props).toMatchObject({rows:expect.arrayContaining([{day:"2026-12-25 (Holiday)",hours:"Closed"},{day:"Timezone",hours:"America/New_York"}])});
    expect(renderToStaticMarkup(<SiteRenderer document={doc} businessFacts={holiday}/>)).toContain("2026-12-25 (Holiday)");
  });
});
