import { headers } from "next/headers";
import { DEFAULT_TENANT } from "./storage/core";

export async function getTenantFromHeaders(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant") || DEFAULT_TENANT;
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
