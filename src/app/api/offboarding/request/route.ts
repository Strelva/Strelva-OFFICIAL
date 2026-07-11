import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { logActivity } from "@/lib/storage";
import { addEvent } from "@/lib/events";
import { getTenantConfig } from "@/lib/tenants";
import { sendSlackNotification } from "@/lib/slack";

const OFFBOARDING_STEPS = [
  "Export content JSON and asset manifest.",
  "Transfer the site repo + files to the client (month 12 or buyout); DNS is already in the client's name.",
  "Open billing portal and cancel the subscription when handoff timing is confirmed.",
  "Remove Strelva custom domains after traffic points to the client-owned deploy.",
  "Revoke Strelva collaborator/DNS access in the client's registrar/Cloudflare and connected tools.",
];

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "billing:manage");
  if (permissionDenied) return permissionDenied;

  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 1000) : "";

  const requestedAt = new Date().toISOString();

  // Audit trail (activity log keeps the full snapshot of steps + notes).
  await logActivity(
    {
      text: "Offboarding handoff requested from Ownership Center",
      time: requestedAt,
      type: "handoff",
      actor: "user",
      section: "ownership-center",
      suppressEvent: true,
      snapshot: { notes, steps: OFFBOARDING_STEPS },
    },
    tenant,
  );

  // Put the handoff in front of Jacob: review-queue event + Slack ping.
  // User-initiated, so logActivity does not auto-emit — add the event explicitly.
  const tenantConfig = await getTenantConfig(tenant);
  let eventId: string | undefined;
  try {
    const event = await addEvent({
      tenantId: tenant,
      source: "website",
      type: "change_request",
      title: "Handoff requested from Ownership Center",
      body: notes
        ? `The owner requested a site handoff.\n\nNotes: ${notes}`
        : "The owner requested a site handoff from the Ownership Center.",
      status: "pending",
      metadata: {
        kind: "offboarding_handoff_request",
        requestedAt,
        notes,
        steps: OFFBOARDING_STEPS,
      },
    });
    eventId = event.id;
  } catch (err) {
    console.error("[offboarding/request] failed to queue handoff event", err);
  }

  const siteLabel = tenantConfig?.siteName || tenant;
  // The note is owner-supplied free text. Escape Slack's control characters so it
  // can't inject mrkdwn like <!channel> or a disguised <url|label> into the ping.
  const slackSafeNotes = notes.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await sendSlackNotification(
    {
      text: `Handoff requested: *${siteLabel}* (${tenant}) opened an Ownership Center handoff request.${
        slackSafeNotes ? `\nNotes: ${slackSafeNotes}` : ""
      }`,
    },
    "platform",
    tenantConfig,
  ).catch((err) => {
    // A handoff request that doesn't reach Jacob is a real miss — the queue
    // event is the durable record, but the Slack ping must not fail silently.
    console.error(`[offboarding/request] Slack handoff ping failed for ${tenant}:`, err);
  });

  return NextResponse.json({
    ok: true,
    message: "Offboarding handoff request recorded.",
    eventId,
    nextSteps: OFFBOARDING_STEPS,
  });
}
