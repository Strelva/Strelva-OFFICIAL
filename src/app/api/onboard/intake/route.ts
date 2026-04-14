import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: Request) {
  // Rate limit: 5 submissions per hour per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (await isRateLimited(`onboard-intake:${ip}`, 5, 3600)) {
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

  // Log to console for now — Sanity/DB storage can be added later
  console.log("[onboard/intake]", { businessName, description, location, email, currentWebsite, referredBy });

  return NextResponse.json({ success: true });
}
