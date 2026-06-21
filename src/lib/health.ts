/**
 * Platform dependency health — Redis, Sanity, Clerk, Stripe, Gemini. Extracted
 * from the /api/health route so the ops board (and anything else) can read the
 * same checks server-side without an HTTP round-trip.
 */

import { getRedis } from "./redis";
import { getSanityClient } from "./sanity";
import { getSupabase } from "./db/client";

const APP_VERSION = process.env.APP_VERSION || "0.1.0";
const TIMEOUT_MS = 3_000;

export type ServiceStatus = "ok" | "not configured" | "error";

export interface ServiceCheck {
  status: ServiceStatus;
  responseMs: number;
}

export interface HealthReport {
  status: "healthy" | "degraded" | "down";
  version: string;
  timestamp: string;
  checks: {
    redis: ServiceCheck;
    supabase: ServiceCheck;
    sanity: ServiceCheck;
    clerk: ServiceCheck;
    stripe: ServiceCheck;
    gemini: ServiceCheck;
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

async function checkSanity(): Promise<ServiceCheck> {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || !process.env.SANITY_API_TOKEN) {
    return { status: "not configured", responseMs: 0 };
  }
  try {
    const { ms } = await timed(async () => {
      const client = getSanityClient();
      await withTimeout(client.fetch<number>(`count(*[_type == "siteSettings"])`), TIMEOUT_MS, "Sanity");
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Sanity check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

async function checkSupabase(): Promise<ServiceCheck> {
  const db = getSupabase();
  if (!db) return { status: "not configured", responseMs: 0 };
  try {
    const { ms } = await timed(async () => {
      const { error } = await withTimeout(
        Promise.resolve(db.from("tenants").select("id").limit(1)),
        TIMEOUT_MS,
        "Supabase"
      );
      if (error) throw error;
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Supabase check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const redis = getRedis();
  if (!redis) return { status: "not configured", responseMs: 0 };
  try {
    const { ms } = await timed(async () => {
      await withTimeout(redis.ping(), TIMEOUT_MS, "Redis");
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Redis check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

async function checkClerk(): Promise<ServiceCheck> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  if (!secretKey || !publishableKey) return { status: "not configured", responseMs: 0 };
  const domain = publishableKey.startsWith("pk_")
    ? `https://${Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64").toString("utf-8").replace(/\$$/, "")}`
    : null;
  if (!domain) return { status: "not configured", responseMs: 0 };
  try {
    const { ms } = await timed(async () => {
      const res = await withTimeout(fetch(`${domain}/.well-known/jwks.json`, { method: "GET" }), TIMEOUT_MS, "Clerk");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Clerk check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

async function checkStripe(): Promise<ServiceCheck> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: "not configured", responseMs: 0 };
  try {
    const { ms } = await timed(async () => {
      const res = await withTimeout(
        fetch("https://api.stripe.com/v1/events?limit=1", { headers: { Authorization: `Bearer ${key}` } }),
        TIMEOUT_MS,
        "Stripe",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Stripe check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

async function checkGemini(): Promise<ServiceCheck> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { status: "not configured", responseMs: 0 };
  try {
    const { ms } = await timed(async () => {
      const res = await withTimeout(
        fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { "x-goog-api-key": key },
        }),
        TIMEOUT_MS,
        "Gemini",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
    return { status: "ok", responseMs: ms };
  } catch (err) {
    console.error("[health] Gemini check failed:", err instanceof Error ? err.message : err);
    return { status: "error", responseMs: TIMEOUT_MS };
  }
}

/** Run all dependency checks and roll up an overall status. */
export async function getServiceHealth(): Promise<HealthReport> {
  const [sanity, supabase, redis, clerk, stripe, gemini] = await Promise.all([
    checkSanity(),
    checkSupabase(),
    checkRedis(),
    checkClerk(),
    checkStripe(),
    checkGemini(),
  ]);

  const checks = { redis, supabase, sanity, clerk, stripe, gemini };
  // Core = the live backbone (Redis + Supabase/Postgres). Sanity and Clerk are
  // being decommissioned, so their errors are "degraded", not "down" — otherwise
  // pulling those keys would falsely page the platform as down. not-configured
  // counts as healthy.
  const coreDown = redis.status === "error" || supabase.status === "error";
  const anyError = Object.values(checks).some((c) => c.status === "error");
  const status: HealthReport["status"] = coreDown ? "down" : anyError ? "degraded" : "healthy";

  return { status, version: APP_VERSION, timestamp: new Date().toISOString(), checks };
}
