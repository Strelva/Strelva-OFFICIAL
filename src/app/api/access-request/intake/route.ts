import { NextResponse } from "next/server";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import {
  buildDeliveryStatusUrl,
  createDeliveryStatusToken,
  getExistingLeadToken,
  saveDeliveryLead,
  type DeliveryPlan,
} from "@/lib/access-request-delivery";
import { sendDeliveryStatusEmail, sendNewIntakeLeadEmail } from "@/lib/delivery-email";
import { OPERATOR_URL } from "@/lib/brand";

export async function POST(req: Request) {
  if (await isRateLimitedWindowedAsync(rateLimitKey(req, "access-request-intake"), 5, 3600_000)) {
    return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { businessName, description, location, email, phone, currentWebsite, plan, referredBy } = body;

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
  const safePhone = typeof phone === "string" ? phone.trim().slice(0, 40) : "";
  const safeCurrentWebsite = typeof currentWebsite === "string" ? currentWebsite.trim().slice(0, 300) : "";
  const safeReferredBy = typeof referredBy === "string" ? referredBy.trim().slice(0, 200) : "";
  const planValue: DeliveryPlan | null = plan === "one-time" || plan === "monthly" ? plan : null;
  const planLabel = planValue === "one-time" ? "One-time build" : planValue === "monthly" ? "Monthly plan" : "Not sure";
  const now = new Date().toISOString();
  const existingStatusToken = await getExistingLeadToken(normalizedEmail);
  const statusToken = existingStatusToken || createDeliveryStatusToken();
  const requestOrigin = new URL(req.url).origin;
  const statusUrl = buildDeliveryStatusUrl(requestOrigin, statusToken);

  if (existingStatusToken) {
    const emailSent = await sendDeliveryStatusEmail({
      businessName: normalizedBusinessName,
      email: normalizedEmail,
      statusUrl,
      logPrefix: "[access-request]",
    });

    return NextResponse.json({
      success: true,
      statusUrl,
      emailSent,
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
          text: `New website build request:\n*${normalizedBusinessName}*\n${safeDescription || "No description"}\n${safeLocation || "No location"}\n${normalizedEmail}\nPhone: ${safePhone || "None"}\nWants: ${planLabel}\nCurrent site: ${safeCurrentWebsite || "None"}\nReferred by: ${safeReferredBy || "Direct"}`,
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
    phone: safePhone || null,
    currentWebsite: safeCurrentWebsite || null,
    plan: planValue,
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
      { error: "Delivery tracking is not configured. Email jacob@strelva.com and we will get you added." },
      { status: 503 },
    );
  }

  const emailSent = await sendDeliveryStatusEmail({
    businessName: normalizedBusinessName,
    email: normalizedEmail,
    statusUrl,
    logPrefix: "[access-request]",
  });

  // Notify the team on every genuinely-new lead. Slack-independent: this fires
  // with no env configured (recipients default to jacob@strelva.com), closing
  // the "lands in a DB nobody watches" gap. Best-effort — a failed team email
  // never fails the intake response.
  const leadsUrl = new URL(
    "/admin/leads",
    OPERATOR_URL,
  ).toString();
  await sendNewIntakeLeadEmail({
    lead: {
      businessName: normalizedBusinessName,
      description: safeDescription || null,
      location: safeLocation || null,
      email: normalizedEmail,
      phone: safePhone || null,
      currentWebsite: safeCurrentWebsite || null,
      plan: planValue,
      planLabel,
      referredBy: safeReferredBy || null,
    },
    leadsUrl,
    logPrefix: "[access-request]",
  });

  return NextResponse.json({ success: true, statusUrl, emailSent });
}
