import { createHmac } from "node:crypto";
import { z } from "zod";
import { HomeFinderAdapterError } from "./types";
import { homeFinderInquiryResultSchema, homeFinderSearchResultSchema, type HomeFinderBinding, type HomeFinderInquiry, type HomeFinderSearch } from "./runtime-contracts";
/** Native entry calls the existing licensed IDX runtime, not a synthetic feed.
 * That runtime owns MLS filtering, tokens, encrypted buyer content, worker,
 * verified mail webhooks and seven-day retention. REB owns native admission. */
export function createHomeFinderRuntimeAdapter(options: { baseUrl: string; signingKey: string; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number }) {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash || options.signingKey.length < 32) throw new HomeFinderAdapterError("invalid_scope", "Home Finder runtime configuration is unavailable.");
  const transport = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new HomeFinderAdapterError("invalid_scope", "Home Finder timeout is invalid.");
  async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      const response = await transport(new URL(path, base), { ...init, cache: "no-store", redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json", Accept: "application/json" } });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("missing body");
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 512 * 1024) { await reader.cancel(); throw new HomeFinderAdapterError("response_too_large", "Home Finder returned too much data."); } chunks.push(value.value); } } finally { reader.releaseLock(); }
      if (!response.ok) throw new HomeFinderAdapterError(response.status === 429 ? "rate_limited" : "source_unavailable", "Home Finder could not confirm this request. Retry with the same request ID.", { retryable: true, status: response.status === 429 ? 429 : 503 });
      return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    })();
    void work.catch(() => undefined);
    try {
      return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new HomeFinderAdapterError("timeout", "Home Finder could not confirm this request. Retry with the same request ID.", { retryable: true })); }, timeoutMs); })]);
    } catch (error) {
      if (error instanceof HomeFinderAdapterError) throw error;
      throw new HomeFinderAdapterError("source_unavailable", "Home Finder could not confirm this request. Retry with the same request ID.", { retryable: true });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  return {
    async search(binding: HomeFinderBinding, query: HomeFinderSearch) {
      const params = new URLSearchParams({ installationId: binding.externalInstallationId });
      for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
      const result = await request(`api/listings?${params}`, { method: "GET" }, homeFinderSearchResultSchema);
      const age = now().getTime() - Date.parse(result.sourceCheckedAt);
      if (!Number.isFinite(age) || result.source.name !== binding.sourceName || result.count !== result.listings.length || age < -30_000 || age > result.source.freshnessWindowMinutes * 60_000 || result.listings.length > query.limit) throw new HomeFinderAdapterError("schema_mismatch", "The licensed source or feed freshness could not be confirmed.");
      return result;
    },
    async submit(binding: HomeFinderBinding, input: HomeFinderInquiry) {
      const result = await request("api/inquiries", { method: "POST", body: JSON.stringify({ ...input, installationId: binding.externalInstallationId, agency: { id: binding.agencyId, name: "Agency" } }) }, homeFinderInquiryResultSchema);
      if (result.requestId !== input.submissionId) throw new HomeFinderAdapterError("schema_mismatch", "The inquiry receipt belongs to another request.");
      return result;
    },
    receiptReference(binding: HomeFinderBinding, requestId: string) {
      const payload = Buffer.from(JSON.stringify({ installationId: binding.externalInstallationId, requestId }), "utf8").toString("base64url");
      const signed = `hfr1.${payload}`;
      return `${signed}.${createHmac("sha256", options.signingKey).update(signed).digest("base64url")}`;
    },
  };
}
export type HomeFinderRuntimeAdapter = ReturnType<typeof createHomeFinderRuntimeAdapter>;
export function configuredHomeFinderRuntimeAdapter(): HomeFinderRuntimeAdapter | null {
  const baseUrl = process.env.HOME_FINDER_MANAGEMENT_BASE_URL;
  const signingKey = process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY;
  if (!baseUrl || !signingKey) return null;
  try { return createHomeFinderRuntimeAdapter({ baseUrl, signingKey }); } catch { return null; }
}
