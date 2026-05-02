/**
 * Core storage utilities shared across domain modules.
 * Handles Sanity detection, dev file I/O, and tenant defaults.
 */

import { promises as fs } from "fs";
import path from "path";

export const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

/** Default tenant - used only when no tenant is in scope. Real tenants always pass an explicit tenant ID. */
export const DEFAULT_TENANT = "demo";

// --- Dev file helpers ---

export function devContentPath(tenant: string): string {
  return path.join(process.cwd(), `dev-content-${tenant}.json`);
}

export async function readDevContent(tenant: string = DEFAULT_TENANT): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(devContentPath(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function writeDevContent(data: Record<string, unknown>, tenant: string = DEFAULT_TENANT): Promise<void> {
  await fs.writeFile(devContentPath(tenant), JSON.stringify(data, null, 2));
}

export async function readDevFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeDevFile<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
