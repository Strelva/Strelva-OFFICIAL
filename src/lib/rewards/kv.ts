/**
 * Upstash Redis (HTTP) client factory for REB-owned rewards data.
 *
 * Delegates to the shared Redis client in src/lib/redis.ts so the entire
 * app uses a single connection. When credentials are unset, getKv() returns
 * null and every repository call throws KvNotConfiguredError. Callers
 * (rewardsProxy.ts) catch that sentinel and fall through to the legacy
 * GLDF signed-proxy path.
 */

import { getRedis } from "../redis";

export class KvNotConfiguredError extends Error {
  constructor() {
    super("rewards KV is not configured (UPSTASH_REDIS_REST_URL/TOKEN unset)");
    this.name = "KvNotConfiguredError";
  }
}

export function getKv() {
  return getRedis();
}

export function requireKv() {
  const kv = getRedis();
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
