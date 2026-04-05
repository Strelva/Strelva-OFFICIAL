import crypto from "crypto";
import type { SearchData } from "./types";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = base64url(sign.sign(key.private_key));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

const EMPTY_DATA: SearchData = {
  queries: [],
  totalClicks: 0,
  totalImpressions: 0,
  fetchedAt: new Date().toISOString(),
};

export async function fetchSearchData(siteUrl: string, days = 7): Promise<SearchData> {
  const keyJson = process.env.GOOGLE_SEARCH_CONSOLE_KEY;
  if (!keyJson) return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };

  let key: ServiceAccountKey;
  try {
    key = JSON.parse(keyJson);
  } catch {
    console.error("Failed to parse GOOGLE_SEARCH_CONSOLE_KEY");
    return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
  }

  try {
    const token = await getAccessToken(key);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const encodedUrl = encodeURIComponent(siteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          dimensions: ["query"],
          rowLimit: 20,
        }),
      },
    );

    if (!res.ok) {
      console.error(`Search Console API error: ${res.status} ${await res.text()}`);
      return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
    }

    const data = await res.json();
    const rows = data.rows || [];

    const queries = rows.map((row: { keys: string[]; clicks: number; impressions: number; position: number }) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      position: Math.round(row.position * 10) / 10,
    }));

    const totalClicks = queries.reduce((sum: number, q: { clicks: number }) => sum + q.clicks, 0);
    const totalImpressions = queries.reduce((sum: number, q: { impressions: number }) => sum + q.impressions, 0);

    return {
      queries,
      totalClicks,
      totalImpressions,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Search Console fetch failed:", err);
    return { ...EMPTY_DATA, fetchedAt: new Date().toISOString() };
  }
}
