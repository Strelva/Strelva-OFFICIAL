import { headers } from "next/headers";
import { DEFAULT_TENANT } from "./storage/core";
import { parseTenantHost } from "./tenant-host";

/** Server-component host->slug resolution. Delegates to the shared Edge-safe
 *  parser so it can never drift from the proxy edge again (#6 identity seam). */
export function getTenantFromHost(host: string): string | null {
  return parseTenantHost(host).tenant;
}

export async function getTenantFromHeaders(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant") || getTenantFromHost(h.get("host") || "") || DEFAULT_TENANT;
}

/**
 * Strict version that throws if no tenant header is present.
 * Use in API routes where falling back to DEFAULT_TENANT would be a security risk.
 */
export async function requireTenantFromHeaders(): Promise<string> {
  const h = await headers();
  const tenant = h.get("x-tenant");
  if (!tenant) {
    throw new Error("Missing x-tenant header");
  }
  return tenant;
}

export async function isPreviewMode(): Promise<boolean> {
  const h = await headers();
  return h.get("x-preview-mode") === "true";
}
