import { NextResponse } from "next/server";
import { isRateLimitedWindowed } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";
import { getSanityClient } from "@/lib/sanity";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

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

  // Persist to Sanity (primary) + Redis (cache for quick listing)
  const leadData = {
    businessName,
    description: description || null,
    location: location || null,
    email,
    currentWebsite: currentWebsite || null,
    referredBy: referredBy || null,
  };

  if (hasSanity) {
    // Check if lead already exists by email
    const existing = await getSanityClient().fetch(
      `*[_type == "onboardLead" && email == $email][0]._id`,
      { email: email.toLowerCase() }
    );
    if (existing) {
      // Update existing lead
      await getSanityClient().patch(existing).set(leadData).commit();
    } else {
      // Create new lead
      await getSanityClient().create({
        _type: "onboardLead",
        ...leadData,
        email: email.toLowerCase(),
        status: "new",
      });
    }
  }

  // Also persist to Redis for quick listing/caching
  const redis = getRedis();
  if (redis) {
    const leadKey = `lead:${email.toLowerCase()}`;
    await redis.set(leadKey, JSON.stringify({ ...leadData, createdAt: new Date().toISOString() }));
    await redis.zadd("leads:all", { score: Date.now(), member: leadKey });
  }

  return NextResponse.json({ success: true });
}
