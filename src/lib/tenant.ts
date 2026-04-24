import { headers } from "next/headers";
import { DEFAULT_TENANT } from "./storage";

export async function getTenantFromHeaders(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant") || DEFAULT_TENANT;
}

export async function isPreviewMode(): Promise<boolean> {
  const h = await headers();
  return h.get("x-preview-mode") === "true";
}
