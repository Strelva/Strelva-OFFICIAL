/**
 * Strelva ↔ custom-repo contract.
 *
 * Stable wire format consumed by client repos (Rohlax, GLDF, future
 * custom repos). The version constant is exported as both the canonical
 * SCAFFOLD_CONTRACT_VERSION and the legacy REB_CONTRACT_VERSION alias —
 * existing custom-repo code that imports the REB_* name keeps working
 * while new code migrates to SCAFFOLD_*.
 *
 * Header names (`x-reb-timestamp`, `x-reb-signature`) are intentionally
 * NOT renamed: they are part of the wire format and every deployed
 * custom repo verifies them. Renaming would break revalidation
 * unilaterally. A future v2 contract can switch to `x-scaffold-*`.
 */
import * as crypto from "crypto";

export const SCAFFOLD_CONTRACT_VERSION = "v1" as const;
/** @deprecated Use SCAFFOLD_CONTRACT_VERSION. Kept for backward compatibility. */
export const REB_CONTRACT_VERSION = SCAFFOLD_CONTRACT_VERSION;
export const GLDF_TENANT_ID = "gldf" as const;

export interface RevalidationPayload {
  tenant: string;
  paths?: string[];
  tags?: string[];
  all?: boolean;
}

export interface SignedRevalidationRequest {
  body: string;
  headers: {
    "Content-Type": "application/json";
    "x-reb-timestamp": string;
    "x-reb-signature": string;
  };
}

export function isTenantId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
}

export function createRevalidationBody(payload: RevalidationPayload): string {
  return JSON.stringify(payload);
}

export function signRevalidationBody(
  body: string,
  secret: string,
  timestamp: string = Date.now().toString()
): SignedRevalidationRequest {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-reb-timestamp": timestamp,
      "x-reb-signature": signature,
    },
  };
}

export function verifyRevalidationSignature(
  body: string,
  secret: string,
  timestamp: string,
  signature: string,
  nowMs: number = Date.now()
): boolean {
  const ts = Number(timestamp);
  // 5-minute replay window: prevents clock skew issues but allows limited replay on repo clock drift.
  // Tighter windows (e.g., 1m) risk false rejects on ~1% of requests; 5m is a reasonable operational tradeoff.
  if (Number.isNaN(ts) || Math.abs(nowMs - ts) > 300_000) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const provided = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
}

// --- Preview authorization (v1 draft reads) ---
//
// Public v1 reads expose PUBLISHED content. `?preview=true` returns drafts, so
// it must be authorized — otherwise anyone who knows a tenant slug could read
// that tenant's unpublished content. A preview request proves itself with an
// HMAC over `${timestamp}.preview.${tenant}` using a DOMAIN-SEPARATED key
// derived from the tenant's revalidationSecret. Even though the same underlying
// secret is used, we derive a distinct key for the preview surface by appending a
// well-known context label via a secondary HMAC pass — so a valid revalidation
// signature can never be replayed as a preview token and vice-versa.
// Header names are x-scaffold-* (new contract surface, additive).

export const PREVIEW_TIMESTAMP_HEADER = "x-scaffold-preview-ts";
export const PREVIEW_SIGNATURE_HEADER = "x-scaffold-preview-sig";

/**
 * Derive the domain-separated preview signing key from the per-tenant
 * revalidationSecret. Appending a fixed context label via a secondary HMAC pass
 * ensures the preview-token key is cryptographically distinct from the
 * revalidation-HMAC key, even when both start from the same shared secret.
 */
function derivePreviewKey(secret: string): string {
  return crypto.createHmac("sha256", secret).update("preview-token-v1").digest("hex");
}

export function signPreviewToken(
  tenant: string,
  secret: string,
  timestamp: string = Date.now().toString()
): { timestamp: string; signature: string } {
  const previewKey = derivePreviewKey(secret);
  const signature = crypto
    .createHmac("sha256", previewKey)
    .update(`${timestamp}.preview.${tenant}`)
    .digest("hex");
  return { timestamp, signature };
}

export function verifyPreviewToken(
  tenant: string,
  secret: string,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  // Same 5-minute replay window as the revalidation signature.
  if (Number.isNaN(ts) || Math.abs(nowMs - ts) > 300_000) return false;
  const previewKey = derivePreviewKey(secret);
  const expected = crypto
    .createHmac("sha256", previewKey)
    .update(`${timestamp}.preview.${tenant}`)
    .digest("hex");
  let provided: Buffer;
  let expectedBuf: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
}

export function parseRevalidationPayload(value: unknown): RevalidationPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!isTenantId(candidate.tenant)) return null;

  if (
    candidate.paths !== undefined &&
    (!Array.isArray(candidate.paths) || !candidate.paths.every((p) => typeof p === "string"))
  ) {
    return null;
  }

  if (
    candidate.tags !== undefined &&
    (!Array.isArray(candidate.tags) || !candidate.tags.every((t) => typeof t === "string"))
  ) {
    return null;
  }

  if (candidate.all !== undefined && typeof candidate.all !== "boolean") return null;

  return {
    tenant: candidate.tenant,
    paths: candidate.paths as string[] | undefined,
    tags: candidate.tags as string[] | undefined,
    all: candidate.all as boolean | undefined,
  };
}

export const scaffoldRoutes = {
  publicContent: (tenant: string, section: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/content/${tenant}/${section}`,
  publicPageConfig: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/page-config/${tenant}`,
  revalidate: () => `/api/${SCAFFOLD_CONTRACT_VERSION}/revalidate`,
} as const;

/** @deprecated Use scaffoldRoutes. Kept for backward compatibility. */
export const rebRoutes = scaffoldRoutes;
