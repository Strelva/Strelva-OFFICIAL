import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getSubscribers, getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subject, body, previewText } = await req.json();

    if (!subject || !body) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    const tenant = await getTenantFromHeaders();
    const subscribers = await getSubscribers(tenant);
    const activeSubscribers = subscribers.filter((s) => s.status === "active");

    if (activeSubscribers.length === 0) {
      return NextResponse.json(
        { error: "No active subscribers to send to" },
        { status: 400 }
      );
    }

    const settings = await getContent("settings", tenant);
    const fromName = settings.siteName || "Newsletter";

    // Use Resend if configured, otherwise log to console (dev mode)
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const emails = activeSubscribers.map((s) => s.email);

      // Send via Resend batch (up to 100 per batch)
      const batchSize = 100;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        await resend.batch.send(
          batch.map((to) => ({
            from: `${fromName} <newsletter@${process.env.RESEND_DOMAIN || "updates.reb.studio"}>`,
            to,
            subject,
            html: body,
            text: body.replace(/<[^>]*>/g, ""),
            ...(previewText ? { headers: { "X-Preview-Text": previewText } } : {}),
          }))
        );
      }

      return NextResponse.json({
        success: true,
        subscriberCount: activeSubscribers.length,
        message: `Newsletter sent to ${activeSubscribers.length} subscribers`,
      });
    }

    // Dev mode — log to console
    console.log("=== NEWSLETTER (dev mode — no RESEND_API_KEY) ===");
    console.log(`From: ${fromName}`);
    console.log(`Subject: ${subject}`);
    console.log(`To: ${activeSubscribers.length} subscribers`);
    console.log(`Body: ${body.substring(0, 200)}...`);
    console.log("================================================");

    return NextResponse.json({
      success: true,
      subscriberCount: activeSubscribers.length,
      message: `Newsletter logged to console (dev mode) — ${activeSubscribers.length} subscribers`,
      devMode: true,
    });
  } catch (err) {
    console.error("Newsletter send error:", err);
    return NextResponse.json(
      { error: "Failed to send newsletter" },
      { status: 500 }
    );
  }
}
