import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { consumeInvite } from "@/lib/invites";
import { assignUserToTenant } from "@/lib/auth";

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
  };
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[clerk-webhook] Verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created") {
    const userId = evt.data.id;
    const emails = evt.data.email_addresses || [];

    for (const emailObj of emails) {
      const email = emailObj.email_address;
      const invite = await consumeInvite(email);

      if (invite) {
        const assigned = await assignUserToTenant(userId, invite.tenant, invite.role);
        console.log(
          `[clerk-webhook] Auto-assigned ${email} to tenant ${invite.tenant}: ${assigned ? "success" : "failed"}`
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
