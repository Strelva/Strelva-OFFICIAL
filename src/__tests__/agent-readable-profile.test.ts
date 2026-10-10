import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ hosted: vi.fn(), profile: vi.fn() }));
vi.mock("@/products/websites/index", () => ({ getHostedSite: ports.hosted }));
vi.mock("@/platform/agent-channel/profile", () => ({ publicBusinessProfile: ports.profile }));
import { GET } from "@/app/llms.txt/route";
import { businessJsonLd } from "@/products/connected-sites/contracts";
const verification = {domain:{verified:false,url:"https://unproved.example",confirmedAt:null},googleBusinessProfile:{linked:true,verified:null,url:"https://unproved-gbp.example"},ownerConfirmedFactCount:1,lastConfirmedAt:"2026-10-07T00:00:00Z",operatingAgencies:[{name:"Fixture agency"}]};
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_AGENT_READABLE","1");vi.stubEnv("STRELVA_WORKSPACE_RELEASE","1");
  ports.hosted.mockResolvedValue({tenant:"fixture",origin:"https://fixture.example",preview:false});
  ports.profile.mockResolvedValue({facts:{display_name:"Fixture Consulting",description:"Confirmed description"},services:[{name:"Consulting",description:null,priceText:null}],policies:[],verification});
});
describe("native public agent evidence", () => {
  it("generates a fact sheet from native record on an issued hosted site", async () => {
    const r=await GET();expect(r.status).toBe(200);expect(r.headers.get("content-type")).toContain("text/plain");
    const text=await r.text();expect(text).toContain("Fixture Consulting");expect(text).toContain("Fixture agency");expect(text).not.toContain("Domain verified: yes");
    expect(ports.profile).toHaveBeenCalledWith("fixture");
  });
  it("keeps flags, main app and preview off without reading business data", async () => {
    vi.stubEnv("STRELVA_AGENT_READABLE","0");expect((await GET()).status).toBe(404);
    vi.stubEnv("STRELVA_AGENT_READABLE","1");ports.hosted.mockResolvedValue(null);expect((await GET()).status).toBe(404);
    ports.hosted.mockResolvedValue({preview:true});expect((await GET()).status).toBe(404);expect(ports.profile).not.toHaveBeenCalled();
  });
  it("reports outage without treating unverified links as confirmed evidence", async () => {
    ports.profile.mockRejectedValue(new Error("database unavailable"));expect((await GET()).status).toBe(503);
    expect(businessJsonLd({name:"Fixture",verification})?.sameAs).toBeUndefined();
    expect(businessJsonLd({name:"Fixture",verification:{...verification,domain:{...verification.domain,verified:true}}})?.sameAs).toEqual(["https://unproved.example"]);
  });
  it("serializes confirmed services, hours and reservation action", () => {
    const ld=businessJsonLd({name:"Fixture",services:[{name:"Consulting"}],hours:[{day:"mon",opens:"09:00",closes:"17:00",closed:false}],booking_url:"https://fixture.example/book"});
    expect(ld?.makesOffer).toEqual([{"@type":"Offer",itemOffered:{"@type":"Service",name:"Consulting"}}]);
    expect(ld?.openingHoursSpecification).toEqual([{"@type":"OpeningHoursSpecification",dayOfWeek:"Monday",opens:"09:00",closes:"17:00"}]);
    expect(ld?.potentialAction).toEqual({"@type":"ReserveAction",target:"https://fixture.example/book"});
  });
});
