import { createHash } from "node:crypto";
import { z } from "zod";
import { runAuditSnapshot, validateUrlSafety } from "@/lib/audit/checks";
import type { CategoryResult } from "@/lib/audit/types";

const websiteSourceInputSchema = z.object({
  url: z.string().trim().url().max(2_048),
}).strict();

export type PublicWebsiteSourceStatus = "available" | "unavailable" | "rate_limited" | "access_denied";
export type PublicWebsiteContentVisibility = "server_visible" | "server_visible_truncated" | "no_server_visible_text";
const CONTENT_EXCERPT_LIMIT = 4_000;

export interface PublicWebsiteSourceRead {
  sourceUrl: string;
  observedAt: string;
  freshness: "fresh" | "unavailable";
  status: PublicWebsiteSourceStatus;
  retryable: boolean;
  fingerprint?: string;
  contentFingerprint?: string;
  contentLength?: number;
  contentExcerpt?: string;
  contentVisibility?: PublicWebsiteContentVisibility;
  fetchedUrl?: string;
  categories?: CategoryResult[];
  reason?: string;
}

interface PublicWebsiteSourceDependencies {
  auditSnapshot?: (url: string) => Promise<{ categories: CategoryResult[]; visibleText: string; fetchedUrl?: string; httpStatus?: number; fetchOk?: boolean }>;
  audit?: (url: string) => Promise<CategoryResult[]>;
  validateUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
}

function failureCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; name?: unknown; status?: unknown; statusCode?: unknown };
  return [candidate.code, candidate.name, candidate.status, candidate.statusCode]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
}

function failureOutcome(error: unknown): Pick<PublicWebsiteSourceRead, "status" | "retryable" | "reason"> {
  const code = failureCode(error);
  if (code.includes("unauthorized") || code.includes("forbidden") || code.includes("401") || code.includes("403")) {
    // This adapter reads a public page and stores no credentials. A 401/403
    // therefore means the page is currently inaccessible, not that a token
    // was revoked.
    return { status: "access_denied", retryable: true, reason: "source_access_denied" };
  }
  if (code.includes("rate") || code.includes("429")) {
    return { status: "rate_limited", retryable: true, reason: "source_rate_limited" };
  }
  if (code.includes("timeout") || code.includes("abort") || code.includes("unavailable") || code.includes("network")) {
    return { status: "unavailable", retryable: true, reason: "source_unavailable" };
  }
  return { status: "unavailable", retryable: false, reason: "source_read_failed" };
}

/**
 * Read one explicitly supplied public website through the existing audit
 * engine. The adapter only reads; it never publishes, stores credentials, or
 * changes the canonical scan store. Callers can persist this receipt beside a
 * check run when a live source is selected.
 */
export function createPublicWebsiteSourceAdapter(dependencies: PublicWebsiteSourceDependencies = {}) {
  const auditSnapshot: NonNullable<PublicWebsiteSourceDependencies["auditSnapshot"]> = dependencies.auditSnapshot ?? (dependencies.audit
    ? async (url: string) => ({ categories: await dependencies.audit!(url), visibleText: "" })
    : async (url: string) => {
      const result = await runAuditSnapshot(url);
      return { categories: result.categories, visibleText: result.visibleText, fetchedUrl: result.fetchedUrl, httpStatus: result.httpStatus, fetchOk: result.fetchOk };
    });
  const validateUrl = dependencies.validateUrl ?? validateUrlSafety;
  const now = dependencies.now ?? (() => new Date());

  return {
    async read(raw: unknown): Promise<PublicWebsiteSourceRead> {
      const input = websiteSourceInputSchema.parse(raw);
      const observedAt = now().toISOString();
      try {
        // Keep the canonical SSRF guard at this boundary even when the audit
        // runner is injected for a local test.
        await validateUrl(input.url);
        const result = await auditSnapshot(input.url);
        if (result.httpStatus === 401 || result.httpStatus === 403 || result.httpStatus === 429 || result.fetchOk === false) {
          const error = new Error(`Public page returned HTTP ${result.httpStatus ?? "unavailable"}`);
          if (result.httpStatus !== undefined) Object.assign(error, { status: result.httpStatus });
          throw error;
        }
        const fingerprint = createHash("sha256").update(JSON.stringify(result.categories)).digest("hex");
        const contentFingerprint = createHash("sha256").update(result.visibleText).digest("hex");
        const contentExcerpt = result.visibleText.slice(0, CONTENT_EXCERPT_LIMIT);
        return {
          sourceUrl: input.url,
          observedAt,
          freshness: "fresh",
          status: "available",
          retryable: false,
          fingerprint,
          contentFingerprint,
          contentLength: result.visibleText.length,
          contentExcerpt,
          contentVisibility: result.visibleText.length === 0 ? "no_server_visible_text" : result.visibleText.length > CONTENT_EXCERPT_LIMIT ? "server_visible_truncated" : "server_visible",
          ...(result.fetchedUrl ? { fetchedUrl: result.fetchedUrl } : {}),
          categories: result.categories,
        };
      } catch (error) {
        return { sourceUrl: input.url, observedAt, freshness: "unavailable", ...failureOutcome(error) };
      }
    },
  };
}

export type PublicWebsiteSourceAdapter = ReturnType<typeof createPublicWebsiteSourceAdapter>;
