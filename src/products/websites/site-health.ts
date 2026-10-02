import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
export interface HostedWebsiteHealthTarget { workspaceId: string; workId: string; tenantId: string; revision: number; contentHash: string; url: string }
export interface WebsiteHealthReceipt extends HostedWebsiteHealthTarget { checkedAt: string; status: "healthy" | "unreachable" | "hash_missing" | "hash_mismatch"; observedHash?: string }
export async function checkWebsiteHealth(target: HostedWebsiteHealthTarget, dependencies: { fetch?: (url: string) => Promise<string | null>; now?: () => Date } = {}): Promise<WebsiteHealthReceipt> {
  const base = { ...target, checkedAt: (dependencies.now?.() ?? new Date()).toISOString() };
  try {
    const html = await (dependencies.fetch ?? (url => fetchPinnedPublicText(url,{ timeoutMs: 8000, maxBytes: 2_000_000 })))(target.url);
    if (html === null) return { ...base,status: "unreachable" };
    // Renderer emits the authoritative hash on a dedicated meta element.
    const tag = html.match(/<meta\b[^>]*\bname=["']strelva-site-hash["'][^>]*>/i)?.[0];
    const observedHash = tag?.match(/\bcontent=["']([a-f0-9]{64})["']/i)?.[1]?.toLowerCase();
    if (!observedHash) return { ...base,status: "hash_missing" };
    return { ...base,status: observedHash === target.contentHash ? "healthy" : "hash_mismatch",observedHash };
  } catch { return { ...base,status: "unreachable" }; }
}
export async function scanWebsiteHealth(dependencies: { list: () => Promise<HostedWebsiteHealthTarget[]>; save: (receipt: WebsiteHealthReceipt) => Promise<void>; fetch?: (url: string) => Promise<string | null>; alert?: (receipts: WebsiteHealthReceipt[]) => Promise<void> }) {
  const targets = await dependencies.list(); const results: WebsiteHealthReceipt[] = [];
  // Bound network concurrency without dropping sites or hiding storage failures.
  for (let offset = 0; offset < targets.length; offset += 5) {
    const batch = await Promise.all(targets.slice(offset,offset+5).map(target => checkWebsiteHealth(target,{ fetch: dependencies.fetch })));
    for (const receipt of batch) { await dependencies.save(receipt); results.push(receipt); }
  }
  const failed = results.filter(value => value.status !== "healthy");
  if (failed.length && dependencies.alert) await dependencies.alert(failed);
  return { results,processed: results.length,failed: failed.length };
}
