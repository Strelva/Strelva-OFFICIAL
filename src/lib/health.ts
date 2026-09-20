/**
 * Platform dependency health — Redis, Supabase, Stripe, Gemini. Extracted
 * from the /api/health route so the ops board (and anything else) can read the
 * same checks server-side without an HTTP round-trip.
 */

import { getRedis } from "./redis";
import { getSupabase } from "./db/client";
import { version as productVersion } from "../../package.json";

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
  const [supabase, redis, stripe, gemini] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    checkStripe(),
    checkGemini(),
  ]);

  const checks = { redis, supabase, stripe, gemini };
  // Core = the live production backbone (Redis + Supabase/Postgres). Missing
  // configuration is acceptable for local development, but in production it
  // is an outage, not a healthy deployment. Non-core provider errors degrade
  // the product without taking the control plane itself down.
  const coreDown = [redis, supabase].some(
    (check) => check.status === "error" ||
      (process.env.NODE_ENV === "production" && check.status === "not configured"),
  );
  const anyError = Object.values(checks).some((c) => c.status === "error");
  const status: HealthReport["status"] = coreDown ? "down" : anyError ? "degraded" : "healthy";

  return { status, version: process.env.APP_VERSION || productVersion, timestamp: new Date().toISOString(), checks };
}
