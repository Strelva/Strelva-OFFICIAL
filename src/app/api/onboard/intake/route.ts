import { NextResponse } from "next/server";
import { isRateLimitedWindowed } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";

export async function POST(req: Request) {
  // Rate limit: 5 submissions per hour per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (isRateLimitedWindowed(`onboard-intake:${ip}`, 5, 3600_000)) {
    return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  }

  const body = await req.json();
  const { businessName, description, location, email, currentWebsite, referredBy } = body;

  if (!businessName || !email) {
    return NextResponse.json({ error: "Business name and email are required" }, { status: 400 });
  }

  // Notify via Slack if configured
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New lead from /onboard:\n*${businessName}*\n${description || "No description"}\n${location || "No location"}\n${email}\nCurrent site: ${currentWebsite || "None"}\nReferred by: ${referredBy || "Direct"}`,
        }),
      });
    } catch {
      // Slack notification is best-effort
    }
  }

  // Persist to Redis
  const leadData = {
    businessName,
    description: description || null,
    location: location || null,
    email,
    currentWebsite: currentWebsite || null,
    referredBy: referredBy || null,
    createdAt: new Date().toISOString(),
  };

  console.log("[onboard/intake]", leadData);

  const redis = getRedis();
  if (redis) {
    const leadKey = `lead:${email.toLowerCase()}`;
    await redis.set(leadKey, JSON.stringify(leadData));
    // Also add to a sorted set for chronological listing
    await redis.zadd("leads:all", { score: Date.now(), member: leadKey });
  }

  return NextResponse.json({ success: true });
}
