import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { validateUrlSafety } from "@/lib/audit/checks";
import { sniffImageType, readImageDimensions } from "@/lib/image-signature";
import { uploadTenantMedia } from "@/lib/media-store";
import type { SiteDocument } from "./site-document";
import type { AssetRef } from "./rebuild-crawl";

/** The same DNS-pinning boundary used by the canonical audit, for raster bytes. */
export async function fetchWebsiteAsset(raw: string, options: { maximumBytes?: number; allowUrl?: (url: string) => boolean } = {}): Promise<Buffer> {
  let url = raw; const deadline = Date.now() + 15000; const maximum = options.maximumBytes ?? 8*1024*1024;
  for (let hop = 0; hop <= 5; hop++) {
    if (options.allowUrl && !options.allowUrl(url)) throw new Error("The image URL is outside the approved media store.");
    const parsed = new URL(url);
    if (!["https:","http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port && !["80","443"].includes(parsed.port)) throw new Error("Unsafe image URL.");
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    let address: string;
    try {
      ({ address } = await Promise.race([validateUrlSafety(url), new Promise<never>((_,reject) => { dnsTimer = setTimeout(() => reject(new Error("Image DNS lookup timed out.")), Math.max(1,deadline-Date.now())); })]));
    } finally { if (dnsTimer) clearTimeout(dnsTimer); }
    if (Date.now() >= deadline) throw new Error("Image download timed out.");
    const result = await new Promise<{ status: number; location?: string; buffer: Buffer }>((resolve,reject) => {
      const request = (parsed.protocol === "https:" ? https : http).request(parsed,{ headers: { "User-Agent": "StrelvaRebuild/1.0", "Accept-Encoding": "identity", Accept: "image/avif,image/webp,image/*" }, lookup: (_hostname,_options,callback) => callback(null,address,4) },res => {
        if ([301,302,303,307,308].includes(res.statusCode ?? 0)) { res.resume(); resolve({ status: res.statusCode!, location: res.headers.location, buffer: Buffer.alloc(0) }); return; }
        let size = 0; const buffers: Buffer[] = [];
        res.on("data",(chunk: Buffer) => { size += chunk.length; if (size > maximum) request.destroy(new Error("Image exceeds its byte limit.")); else buffers.push(chunk); });
        res.on("error",reject); res.on("end",() => resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(buffers) }));
      });
      const timer = setTimeout(() => request.destroy(new Error("Image download timed out.")),Math.max(1,deadline-Date.now()));
      request.on("error",reject); request.on("close",() => clearTimeout(timer)); request.end();
    });
    if (result.location && [301,302,303,307,308].includes(result.status)) { url = new URL(result.location,url).href; continue; }
    if (result.status < 200 || result.status >= 300 || !result.buffer.length) throw new Error("The image could not be downloaded.");
    return result.buffer;
  }
  throw new Error("Image redirected too many times.");
}

export async function rehostWebsiteAssets(tenant: string, candidates: AssetRef[], dependencies: { fetch?: typeof fetchWebsiteAsset; upload?: typeof uploadTenantMedia } = {}): Promise<SiteDocument["assets"]> {
  const chosen = [...candidates.filter(asset => asset.kind === "logo"), ...candidates.filter(asset => asset.kind === "image")];
  const unique = chosen.filter((asset,index) => chosen.findIndex(other => other.url === asset.url) === index).slice(0,4);
  const assets: SiteDocument["assets"] = {};
  let total = 0;
  for (const candidate of unique) {
    const buffer = await (dependencies.fetch ?? fetchWebsiteAsset)(candidate.url,{ maximumBytes: 8*1024*1024 });
    total += buffer.length; if (total > 16*1024*1024) throw new Error("The selected site images exceed the media budget.");
    const mime = sniffImageType(buffer); const dimensions = readImageDimensions(buffer);
    if (!mime || !dimensions || dimensions.width > 20000 || dimensions.height > 20000) continue;
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/gif":"gif", "image/webp":"webp", "image/avif":"avif" })[mime];
    const media = await (dependencies.upload ?? uploadTenantMedia)(tenant,buffer,`${contentHash.slice(0,20)}.${ext}`,mime);
    assets[`asset_${contentHash.slice(0,20)}`] = { url: media.url, alt: candidate.kind === "logo" ? candidate.alt || "Business logo" : candidate.alt, width: dimensions.width, height: dimensions.height, sourceUrl: candidate.url, contentHash };
  }
  return assets;
}

export async function downloadWebsiteExportAssets(document: SiteDocument) {
  const files: Array<{ assetId: string; path: string; content: string; encoding: "base64" }> = [];
  let total = 0;
  for (const [assetId,asset] of Object.entries(document.assets)) {
    const url = new URL(asset.url);
    const allowed = (value: string) => { const next = new URL(value); return next.protocol === "https:" && next.hostname === url.hostname && next.pathname === url.pathname && next.pathname.startsWith("/media/"); };
    if (!url.hostname.endsWith(".public.blob.vercel-storage.com") && !url.hostname.endsWith(".blob.vercel-storage.com")) throw new Error("The exported image is not stored in tenant media.");
    const buffer = await fetchWebsiteAsset(asset.url,{ allowUrl: allowed }); total += buffer.length;
    if (total > 64*1024*1024) throw new Error("The image export exceeds its archive limit.");
    if (asset.contentHash && createHash("sha256").update(buffer).digest("hex") !== asset.contentHash) throw new Error("An exported image changed after its content hash was recorded.");
    const mime = sniffImageType(buffer); if (!mime) throw new Error("An exported image is not a supported raster asset.");
    const extension = mime.split("/")[1]!.replace("jpeg","jpg");
    files.push({ assetId, path: `assets/${assetId}.${extension}`, content: buffer.toString("base64"), encoding: "base64" });
  }
  return files;
}
