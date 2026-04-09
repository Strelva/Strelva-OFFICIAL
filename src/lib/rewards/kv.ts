/**
 * Upstash Redis (HTTP) client factory for REB-owned rewards data.
 *
 * Required env vars (set in Vercel project for REB):
 *   UPSTASH_REDIS_REST_URL    — e.g. "https://xxxx.upstash.io"
 *   UPSTASH_REDIS_REST_TOKEN  — long-lived REST token from Upstash console
 *
 * When either is unset, getKv() returns null and every repository call throws
 * KvNotConfiguredError. Callers (rewardsProxy.ts) catch that sentinel and
 * fall through to the legacy GLDF signed-proxy path. This lets Phase 15a land
 * on REB before credentials exist without breaking the dashboard.
 *
 * Provider-agnostic: @upstash/redis speaks plain HTTP, so this also works
 * against Vercel KV or any Upstash-compatible endpoint.
 */

import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

export class KvNotConfiguredError extends Error {
  constructor() {
    super("rewards KV is not configured (UPSTASH_REDIS_REST_URL/TOKEN unset)");
    this.name = "KvNotConfiguredError";
  }
}

export function getKv(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    cached = null;
    return null;
  }

  try {
    cached = new Redis({ url, token });
    return cached;
  } catch {
    // Never throw from the factory — callers rely on null as "not configured".
    cached = null;
    return null;
  }
}

export function requireKv(): Redis {
  const kv = getKv();
  if (!kv) throw new KvNotConfiguredError();
  return kv;
}

// Key scheme — tenant-scoped, reb: prefix to avoid collisions with any
// legacy gldf: keys if the same Redis ever gets shared.
export const keys = {
  member: (tenant: string, email: string) =>
    `reb:rewards:${tenant}:member:${email.trim().toLowerCase()}`,
  membersSet: (tenant: string) => `reb:rewards:${tenant}:members`,
  txns: (tenant: string, email: string) =>
    `reb:rewards:${tenant}:txns:${email.trim().toLowerCase()}`,
};
