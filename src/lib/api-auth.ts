import { NextRequest, NextResponse } from "next/server";
import { getSanityClient } from "./sanity";

export interface APIClient {
  id: string;
  name: string;
  apiKey: string;
  plan: "starter" | "growth" | "scale";
  active: boolean;
  createdAt: string;
  ownerEmail?: string;
  usageThisMonth?: number;
}

const clientCache = new Map<string, { client: APIClient; cachedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

export async function getClientByAPIKey(apiKey: string): Promise<APIClient | null> {
  if (!apiKey || !apiKey.startsWith("reb_")) return null;

  const cached = clientCache.get(apiKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.client;
  }

  const sanity = getSanityClient();
  if (!sanity) return null;

  const client = await sanity.fetch<APIClient | null>(
    `*[_type == "apiClient" && apiKey == $apiKey && active == true][0]{
      "id": _id,
      name,
      apiKey,
      plan,
      active,
      createdAt,
      ownerEmail,
      usageThisMonth
    }`,
    { apiKey }
  );

  if (client) {
    clientCache.set(apiKey, { client, cachedAt: Date.now() });
  }

  return client;
}

export async function withAPIAuth(
  req: NextRequest,
  handler: (client: APIClient) => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const apiKey = authHeader?.replace("Bearer ", "") || req.headers.get("x-api-key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API key. Set Authorization: Bearer reb_xxx or X-API-Key header." },
      { status: 401 }
    );
  }

  const client = await getClientByAPIKey(apiKey);

  if (!client) {
    return NextResponse.json(
      { error: "Invalid API key." },
      { status: 401 }
    );
  }

  if (!client.active) {
    return NextResponse.json(
      { error: "API key is inactive. Check your billing status." },
      { status: 403 }
    );
  }

  return handler(client);
}

export function generateAPIKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `reb_live_${key}`;
}
