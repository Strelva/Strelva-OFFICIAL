import * as crypto from "crypto";

export const REB_CONTRACT_VERSION = "v1" as const;
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
  if (Number.isNaN(ts) || Math.abs(nowMs - ts) > 300_000) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const provided = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
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

export const rebRoutes = {
  publicContent: (tenant: string, section: string) =>
    `/api/${REB_CONTRACT_VERSION}/content/${tenant}/${section}`,
  publicPageConfig: (tenant: string) => `/api/${REB_CONTRACT_VERSION}/page-config/${tenant}`,
  revalidate: () => `/api/${REB_CONTRACT_VERSION}/revalidate`,
} as const;
