import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ request:vi.fn(), dns:vi.fn(), upload:vi.fn() }));
vi.mock("node:https",()=>({ request:network.request }));
vi.mock("node:http",()=>({ request:network.request }));
vi.mock("@/lib/audit/checks",()=>({ validateUrlSafety:network.dns }));
vi.mock("@/lib/media-store",()=>({ uploadTenantMedia:network.upload }));
import { downloadWebsiteExportAssets, fetchWebsiteAsset, rehostWebsiteAssets } from "@/products/websites/site-media";
import { siteDocumentSchema, type SiteDocument } from "@/products/websites/site-document";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2cAAAAASUVORK5CYII=","base64");
const blob = "https://example.public.blob.vercel-storage.com/media/example/photo.png";
function document(assets: SiteDocument["assets"]): SiteDocument { return siteDocumentSchema.parse({ version:2, siteName:"[Business]", theme:{palette:"light",typeScale:"standard"},pages:[{path:"/",title:"Home",description:"Our services",root:"root"}],nodes:{root:{id:"root",type:"Section",variant:"container",props:{}}},facts:{},assets,redirects:[],provenance:{composer:"rules"} }); }
interface ResponseRow { status:number; body?:Buffer; location?:string }
let responses: ResponseRow[];
beforeEach(()=>{
  responses = []; network.request.mockReset(); network.dns.mockReset(); network.upload.mockReset();
  network.dns.mockResolvedValue({ address:"203.0.113.10" });
  network.upload.mockResolvedValue({ url:blob });
  network.request.mockImplementation((_url:URL,_options:unknown,onResponse:(response:unknown)=>void)=>{
    const row = responses.shift(); if (!row) throw new Error("Unexpected mocked network request");
    let stopped = false;
    const request = Object.assign(new EventEmitter(), { end() { queueMicrotask(()=>{
      const response = Object.assign(new EventEmitter(),{statusCode:row.status,headers:row.location?{location:row.location}:{},resume(){}});
      onResponse(response);
      if (row.body && !stopped) response.emit("data",row.body);
      if (!stopped && !row.location) response.emit("end");
      request.emit("close");
    }); }, destroy(error:Error) { stopped=true; request.emit("error",error); request.emit("close"); return request; } });
    return request;
  });
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

describe("website asset safety and immutable image export",()=>{
  it("pins the DNS-validated public address and returns exact image bytes",async()=>{
    responses.push({status:200,body:png});
    expect(await fetchWebsiteAsset("https://source.example/photo.png")).toEqual(png);
    const options = network.request.mock.calls[0]![1] as {lookup:(hostname:string,options:unknown,callback:(error:null,address:string,family:number)=>void)=>void};
    const lookup = vi.fn(); options.lookup("source.example",{},lookup);
    expect(lookup).toHaveBeenCalledWith(null,"203.0.113.10",4);
    expect(network.dns).toHaveBeenCalledWith("https://source.example/photo.png");
  });
  it("answers Node's all:true lookup with the pinned IPv4 address list (audit finding 4)",async()=>{
    responses.push({status:200,body:png});
    await fetchWebsiteAsset("https://source.example/photo.png");
    const options = network.request.mock.calls[0]![1] as {family?:number;autoSelectFamily?:boolean;lookup:(hostname:string,options:unknown,callback:(...args:unknown[])=>void)=>void};
    const all = vi.fn(); options.lookup("source.example",{all:true},all);
    expect(all).toHaveBeenCalledWith(null,[{address:"203.0.113.10",family:4}]);
    expect(options.family).toBe(4);
    expect(options.autoSelectFamily).toBe(false);
  });
  it("checks every redirect before opening another network connection",async()=>{
    responses.push({status:302,location:"https://attacker.example/private.png"});
    await expect(fetchWebsiteAsset(blob,{allowUrl:value=>value.startsWith("https://example.public.blob.vercel-storage.com/media/")})).rejects.toThrow("outside the approved media store");
    expect(network.request).toHaveBeenCalledTimes(1); expect(network.dns).toHaveBeenCalledTimes(1);
  });
  it("fails closed on unsafe protocols, credentials, ports and DNS",async()=>{
    for(const url of ["file:///private.png","https://user:password@source.example/photo.png","https://source.example:9000/photo.png"]) await expect(fetchWebsiteAsset(url)).rejects.toThrow("Unsafe image URL");
    expect(network.request).not.toHaveBeenCalled();
    network.dns.mockRejectedValue(new Error("Private address blocked"));
    await expect(fetchWebsiteAsset("https://source.example/photo.png")).rejects.toThrow("Private address blocked");
    expect(network.request).not.toHaveBeenCalled();
  });
  it("bounds a stalled DNS lookup within the image's total deadline",async()=>{
    vi.useFakeTimers(); network.dns.mockImplementation(()=>new Promise(()=>{}));
    const pending = expect(fetchWebsiteAsset("https://source.example/photo.png")).rejects.toThrow("DNS lookup timed out");
    await vi.advanceTimersByTimeAsync(15000); await pending;
    expect(network.request).not.toHaveBeenCalled();
  });
  it("enforces body-byte and successful-response boundaries",async()=>{
    responses.push({status:200,body:Buffer.alloc(20)});
    await expect(fetchWebsiteAsset("https://source.example/photo.png",{maximumBytes:10})).rejects.toThrow("byte limit");
    responses.push({status:404,body:Buffer.from("Not found")});
    await expect(fetchWebsiteAsset("https://source.example/missing.png")).rejects.toThrow("could not be downloaded");
  });
  it("uploads validated raster bytes once, prioritizes the logo and retains source evidence",async()=>{
    const fetch = vi.fn().mockResolvedValue(png);
    const source = "https://source.example/logo.png";
    const result = await rehostWebsiteAssets("example",[{url:source,alt:"",kind:"image"},{url:source,alt:"",kind:"logo"}],{fetch});
    const hash = createHash("sha256").update(png).digest("hex");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(network.upload).toHaveBeenCalledWith("example",png,`${hash.slice(0,20)}.png`,"image/png");
    expect(Object.values(result)).toEqual([{url:blob,alt:"Business logo",width:1,height:1,sourceUrl:source,contentHash:hash}]);
  });
  it("does not upload SVG/script content or implausibly large raster dimensions",async()=>{
    const oversized = Buffer.from(png); oversized.writeUInt32BE(20001,16);
    const fetch = vi.fn().mockResolvedValueOnce(Buffer.from('<svg onload="alert(1)"></svg>')).mockResolvedValueOnce(oversized);
    expect(await rehostWebsiteAssets("example",[{url:"https://source.example/unsafe.svg",alt:"",kind:"image"},{url:"https://source.example/large.png",alt:"",kind:"image"}],{fetch})).toEqual({});
    expect(network.upload).not.toHaveBeenCalled();
  });
  it("exports only recorded media bytes and detects post-approval replacement",async()=>{
    const hash = createHash("sha256").update(png).digest("hex");
    responses.push({status:200,body:png});
    const files = await downloadWebsiteExportAssets(document({photo:{url:blob,alt:"Office",contentHash:hash}}));
    expect(files).toEqual([{assetId:"photo",path:"assets/photo.png",content:png.toString("base64"),encoding:"base64"}]);
    responses.push({status:200,body:Buffer.concat([png,Buffer.from("changed")])});
    await expect(downloadWebsiteExportAssets(document({photo:{url:blob,alt:"Office",contentHash:hash}}))).rejects.toThrow("changed after its content hash");
  });
  it("rejects export URLs outside tenant media before fetching",async()=>{
    await expect(downloadWebsiteExportAssets({...document({}),assets:{photo:{url:"https://source.example/photo.png",alt:"Office"}}})).rejects.toThrow("not stored in tenant media");
    await expect(downloadWebsiteExportAssets(document({photo:{url:"https://example.public.blob.vercel-storage.com/untrusted/photo.png",alt:"Office"}}))).rejects.toThrow("outside the approved media store");
    expect(network.request).not.toHaveBeenCalled();
  });
});
