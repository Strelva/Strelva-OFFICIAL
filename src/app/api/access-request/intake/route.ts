import { NextResponse } from "next/server";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
  buildDeliveryStatusUrl,
  createDeliveryStatusToken,
  getExistingLeadToken,
  saveDeliveryLead,
} from "@/lib/access-request-delivery";

export async function POST(req: Request) {
  if (await isRateLimitedWindowedAsync(rateLimitKey(req, "access-request-intake"), 5, 3600_000)) {
    return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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
  const now = new Date().toISOString();
  const existingStatusToken = await getExistingLeadToken(normalizedEmail);
  const statusToken = existingStatusToken || createDeliveryStatusToken();
  const requestOrigin = new URL(req.url).origin;
  const statusUrl = buildDeliveryStatusUrl(requestOrigin, statusToken);

  if (existingStatusToken) {
    return NextResponse.json({
      success: true,
      statusUrl,
      emailSent: false,
      repeatSubmission: true,
    });
  }

  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New free-site signup request:\n*${normalizedBusinessName}*\n${safeDescription || "No description"}\n${safeLocation || "No location"}\n${normalizedEmail}\nCurrent site: ${safeCurrentWebsite || "None"}\nReferred by: ${safeReferredBy || "Direct"}`,
        }),
      });
    } catch {
      // Slack notification is best-effort.
    }
  }

  const leadData = {
    businessName: normalizedBusinessName,
    description: safeDescription || null,
    location: safeLocation || null,
    email: normalizedEmail,
    currentWebsite: safeCurrentWebsite || null,
    referredBy: safeReferredBy || null,
    statusToken,
    deliveryStatus: "received" as const,
    submittedAt: now,
    statusUpdatedAt: now,
  };

  const leadPersisted = await saveDeliveryLead(leadData);
  if (!leadPersisted) {
    console.error("[access-request] Delivery status storage is not configured.");
    return NextResponse.json(
      { error: "Delivery tracking is not configured. Email jacob@scaffoldweb.com and we will get you added." },
      { status: 503 },
    );
  }

  let emailSent = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromDomain = process.env.RESEND_DOMAIN || "updates.scaffoldweb.com";
      const subjectBusinessName = normalizedBusinessName.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      const result = await resend.emails.send({
        from: `Scaffold Web <hello@${fromDomain}>`,
        to: normalizedEmail,
        subject: `We received ${subjectBusinessName}'s site request`,
        html: buildDeliveryStatusEmailHtml({ businessName: normalizedBusinessName, statusUrl }),
        text: buildDeliveryStatusEmailText({ businessName: normalizedBusinessName, statusUrl }),
      });
      if (result.error || !result.data?.id) {
        throw new Error(result.error?.message || "Resend did not return an email id.");
      }
      emailSent = true;
    } catch (err) {
      console.error("[access-request] Delivery status email failed:", err);
    }
  }

  return NextResponse.json({ success: true, statusUrl, emailSent });
}
