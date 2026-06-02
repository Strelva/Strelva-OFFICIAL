import { headers } from "next/headers";
import { DEFAULT_TENANT } from "./storage/core";

export function getTenantFromHost(host: string): string | null {
  const hostWithoutPort = host.toLowerCase().split(":")[0];

  if (hostWithoutPort.endsWith(".localhost")) {
    const subdomain = hostWithoutPort.replace(".localhost", "");
    if (subdomain.startsWith("admin.")) {
      return subdomain.replace(/^admin\./, "") || null;
    }
    return subdomain || null;
  }

  if (hostWithoutPort.endsWith(".strelva.com")) {
    const subdomain = hostWithoutPort.replace(".strelva.com", "");
    if (subdomain.startsWith("admin.")) {
      return subdomain.replace(/^admin\./, "") || null;
    }
    if (subdomain && subdomain !== "www" && subdomain !== "admin") {
      return subdomain;
    }
  }

  return null;
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
