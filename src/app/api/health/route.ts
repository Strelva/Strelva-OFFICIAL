import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";
import { Redis } from "@upstash/redis";

const APP_VERSION = process.env.APP_VERSION || "0.1.0";
const TIMEOUT_MS = 3_000;

type ServiceStatus = "ok" | "not configured" | "error";

interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  timestamp: string;
  services: {
    sanity: ServiceStatus;
    redis: ServiceStatus;
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

async function checkSanity(): Promise<{ status: ServiceStatus; error?: string }> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const token = process.env.SANITY_API_TOKEN;

  if (!projectId || !token) {
    return { status: "not configured" };
  }

  try {
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

    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", error: `Sanity: ${message}` };
  }
}

async function checkRedis(): Promise<{ status: ServiceStatus; error?: string }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return { status: "not configured" };
  }

  try {
    const redis = new Redis({ url, token });

    await withTimeout(redis.ping(), TIMEOUT_MS, "Redis");

    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", error: `Redis: ${message}` };
  }
}

export async function GET() {
  const [sanityResult, redisResult] = await Promise.all([
    checkSanity(),
    checkRedis(),
  ]);

  const errors: string[] = [];
  if (sanityResult.error) errors.push(sanityResult.error);
  if (redisResult.error) errors.push(redisResult.error);

  const hasError = sanityResult.status === "error" || redisResult.status === "error";

  const body: HealthResponse = {
    status: hasError ? "degraded" : "ok",
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    services: {
      sanity: sanityResult.status,
      redis: redisResult.status,
    },
  };

  if (errors.length > 0) {
    body.errors = errors;
  }

  return NextResponse.json(body, { status: hasError ? 503 : 200 });
}
