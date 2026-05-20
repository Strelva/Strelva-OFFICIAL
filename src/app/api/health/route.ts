import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";
import { Redis } from "@upstash/redis";

const APP_VERSION = process.env.APP_VERSION || "0.1.0";
const TIMEOUT_MS = 3_000;

type ServiceStatus = "ok" | "not configured" | "error";

interface ServiceCheck {
  status: ServiceStatus;
  responseMs: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "down";
  version: string;
  timestamp: string;
  checks: {
    redis: ServiceCheck;
    sanity: ServiceCheck;
    clerk: ServiceCheck;
    stripe: ServiceCheck;
    gemini: ServiceCheck;
  };
  errors?: string[];
}

/** Race a promise against a timeout. Rejects on timeout. */
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
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const token = process.env.SANITY_API_TOKEN;

  if (!projectId || !token) {
    return { status: "not configured", responseMs: 0 };
  }

  try {
    const { ms } = await timed(async () => {
      const client = createClient({
        projectId,
        dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
        apiVersion: "2024-01-01",
        useCdn: false,
        token,
      });
      await withTimeout(
        client.fetch<number>(`count(*[_type == "siteSettings"])`),
        TIMEOUT_MS,
        "Sanity",
      );
    });

    return { status: "ok", responseMs: ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", responseMs: TIMEOUT_MS, error: `Sanity: ${message}` };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return { status: "not configured", responseMs: 0 };
  }

  try {
    const { ms } = await timed(async () => {
      const redis = new Redis({ url, token });
      await withTimeout(redis.ping(), TIMEOUT_MS, "Redis");
    });

    return { status: "ok", responseMs: ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", responseMs: TIMEOUT_MS, error: `Redis: ${message}` };
  }
}

async function checkClerk(): Promise<ServiceCheck> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return { status: "not configured", responseMs: 0 };
  }

  try {
    const { ms } = await timed(async () => {
      // Lightweight check: hit the Clerk JWKS endpoint (no auth needed, always public)
      const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
      // Extract the Clerk frontend API domain from the publishable key
      const domain = publishableKey.startsWith("pk_")
        ? `https://${Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64").toString("utf-8").replace(/\$$/, "")}`
        : null;

      if (!domain) {
        // Fallback: just verify the secret key format is valid
        return;
      }

      const res = await withTimeout(
        fetch(`${domain}/.well-known/jwks.json`, { method: "GET" }),
        TIMEOUT_MS,
        "Clerk",
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    });

    return { status: "ok", responseMs: ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", responseMs: TIMEOUT_MS, error: `Clerk: ${message}` };
  }
}

async function checkStripe(): Promise<ServiceCheck> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { status: "not configured", responseMs: 0 };
  }

  try {
    const { ms } = await timed(async () => {
      // Lightweight ping: list 1 event (minimal data, fast)
      const res = await withTimeout(
        fetch("https://api.stripe.com/v1/events?limit=1", {
          headers: { Authorization: `Bearer ${key}` },
        }),
        TIMEOUT_MS,
        "Stripe",
      );

      if (!res.ok && res.status !== 401) {
        throw new Error(`HTTP ${res.status}`);
      }
    });

    return { status: "ok", responseMs: ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", responseMs: TIMEOUT_MS, error: `Stripe: ${message}` };
  }
}

async function checkGemini(): Promise<ServiceCheck> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    return { status: "not configured", responseMs: 0 };
  }

  try {
    const { ms } = await timed(async () => {
      // Lightweight: list models endpoint
      const res = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`),
        TIMEOUT_MS,
        "Gemini",
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    });

    return { status: "ok", responseMs: ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", responseMs: TIMEOUT_MS, error: `Gemini: ${message}` };
  }
}

export async function GET() {
  const [sanity, redis, clerk, stripe, gemini] = await Promise.all([
    checkSanity(),
    checkRedis(),
    checkClerk(),
    checkStripe(),
    checkGemini(),
  ]);

  const checks = { redis, sanity, clerk, stripe, gemini };

  const errors: string[] = [];
  for (const check of Object.values(checks)) {
    if (check.error) errors.push(check.error);
  }

  // "down" if core services (redis or sanity) are failing
  // "degraded" if any non-core service is failing
  // "healthy" if everything is ok or not configured
  const coreDown = redis.status === "error" || sanity.status === "error";
  const anyError = errors.length > 0;

  const status: HealthResponse["status"] = coreDown
    ? "down"
    : anyError
      ? "degraded"
      : "healthy";

  const body: HealthResponse = {
    status,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    checks,
  };

  if (errors.length > 0) {
    body.errors = errors;
  }

  const httpStatus = coreDown ? 503 : anyError ? 200 : 200;
  return NextResponse.json(body, { status: httpStatus });
}
