import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { sendNewsletter } from "@/lib/newsletter";

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;

    const requestBody = await readJsonObject(req);
    if (!requestBody) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const subject = typeof requestBody.subject === "string" ? requestBody.subject : "";
    const body = typeof requestBody.body === "string" ? requestBody.body : "";
    const previewText = typeof requestBody.previewText === "string" ? requestBody.previewText : undefined;

    if (!subject || !body) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    if (await isRateLimitedWindowedAsync(`newsletter-send:${tenant}`, 5, 3_600_000)) {
      return NextResponse.json(
        { error: "Newsletter send limit reached. Try again in an hour." },
        { status: 429 }
      );
    }

    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    // One implementation for both the manual send and the approve-the-draft path
    // (event-actions). sendNewsletter owns sanitize + batch + the Resend error
    // check + per-batch idempotency; don't re-inline that here.
    const result = await sendNewsletter(tenant, { subject, body, previewText });
    if (!result.success) {
      if (result.reason === "no_subscribers") {
        return NextResponse.json({ error: "No active subscribers to send to" }, { status: 400 });
      }
      if (result.reason === "paused") {
        return NextResponse.json({
          success: true,
          subscriberCount: 0,
          message: "Newsletter recorded — sending is currently paused.",
        });
      }
      return NextResponse.json({ error: "Failed to send newsletter" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      subscriberCount: result.subscriberCount,
      message: result.devMode
        ? `Newsletter logged to console (dev mode) — ${result.subscriberCount} subscribers`
        : `Newsletter sent to ${result.subscriberCount} subscribers`,
      ...(result.devMode ? { devMode: true } : {}),
    });
  } catch (err) {
    console.error("Newsletter send error:", err);
    return NextResponse.json(
      { error: "Failed to send newsletter" },
      { status: 500 }
    );
  }
}
