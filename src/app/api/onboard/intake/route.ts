import { NextResponse } from "next/server";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";
import { getSanityClient } from "@/lib/sanity";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

export async function POST(req: Request) {
  if (await isRateLimitedWindowedAsync(rateLimitKey(req, "onboard-intake"), 5, 3600_000)) {
    return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  }

  const body = await req.json();
  const { businessName, description, location, email, currentWebsite, referredBy } = body;

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedBusinessName = typeof businessName === "string" ? businessName.trim().slice(0, 160) : "";

  if (!normalizedBusinessName || !normalizedEmail) {
    return NextResponse.json({ error: "Business name and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  const safeDescription = typeof description === "string" ? description.trim().slice(0, 2000) : "";
  const safeLocation = typeof location === "string" ? location.trim().slice(0, 200) : "";
  const safeCurrentWebsite = typeof currentWebsite === "string" ? currentWebsite.trim().slice(0, 300) : "";
  const safeReferredBy = typeof referredBy === "string" ? referredBy.trim().slice(0, 200) : "";

  // Notify via Slack if configured
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New lead from /onboard:\n*${normalizedBusinessName}*\n${safeDescription || "No description"}\n${safeLocation || "No location"}\n${normalizedEmail}\nCurrent site: ${safeCurrentWebsite || "None"}\nReferred by: ${safeReferredBy || "Direct"}`,
        }),
      });
    } catch {
      // Slack notification is best-effort
    }
  }

  // Persist to Sanity (primary) + Redis (cache for quick listing)
  const leadData = {
    businessName: normalizedBusinessName,
    description: safeDescription || null,
    location: safeLocation || null,
    email: normalizedEmail,
    currentWebsite: safeCurrentWebsite || null,
    referredBy: safeReferredBy || null,
  };

  if (hasSanity) {
    // Check if lead already exists by email
    const existing = await getSanityClient().fetch(
      `*[_type == "onboardLead" && email == $email][0]._id`,
      { email: normalizedEmail }
    );
    if (existing) {
      // Update existing lead
      await getSanityClient().patch(existing).set(leadData).commit();
    } else {
      // Create new lead
      await getSanityClient().create({
        _type: "onboardLead",
        ...leadData,
        status: "new",
      });
    }
  }

  // Also persist to Redis for quick listing/caching
  const redis = getRedis();
  if (redis) {
    const leadKey = `lead:${normalizedEmail}`;
    await redis.set(leadKey, JSON.stringify({ ...leadData, createdAt: new Date().toISOString() }));
    await redis.zadd("leads:all", { score: Date.now(), member: leadKey });
  }

  return NextResponse.json({ success: true });
}
