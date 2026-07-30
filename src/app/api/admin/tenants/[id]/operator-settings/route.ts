import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { getReportCadence, setReportCadence, type ReportCadence } from "@/lib/report-cadence";
import { getReplyVoice, saveReplyVoice, type ReplyMode } from "@/lib/reviews/reply-voice";
import {
  getContentAutonomy,
  saveContentAutonomy,
  type ContentAutonomy,
} from "@/lib/content-autonomy";
import {
  getClientEmailOverride,
  setClientEmailOverride,
  type ClientEmailOverride,
} from "@/lib/client-email-override";

/**
 * Operator controls for the Redis-backed per-client settings that are otherwise
 * client-only, env-only, or unsettable:
 *
 *   • reportCadence    — weekly / monthly (when the report cron emails them)
 *   • replyMode        — off / approve / auto (the review-reply mode; only `mode`
 *                        is touched — guidance/templates are preserved)
 *   • contentAutonomy  — auto / approve (how much AI copy the owner lets ship)
 *   • clientEmail      — inherit / on / off (per-tenant client-email override)
 *
 * POST applies whichever keys are present, audit-logged. GET returns the current
 * values. Super-admin only. (The TenantConfig fields — autoApproveThreshold,
 * reviewsConfig, visibility — go through PATCH /api/admin/tenants instead.)
 */

const REPORT_CADENCES = new Set<ReportCadence>(["weekly", "monthly"]);
const REPLY_MODES = new Set<ReplyMode>(["off", "approve", "auto"]);
const CONTENT_AUTONOMIES = new Set<ContentAutonomy>(["auto", "approve"]);
const CLIENT_EMAILS = new Set<ClientEmailOverride>(["inherit", "on", "off"]);

interface OperatorSettings {
  reportCadence: ReportCadence;
  replyMode: ReplyMode;
  contentAutonomy: ContentAutonomy;
  clientEmail: ClientEmailOverride;
}

async function readCurrent(tenant: string): Promise<OperatorSettings> {
  const [reportCadence, voice, contentAutonomy, clientEmail] = await Promise.all([
    getReportCadence(tenant),
    getReplyVoice(tenant),
    getContentAutonomy(tenant),
    getClientEmailOverride(tenant),
  ]);
  return { reportCadence, replyMode: voice.mode, contentAutonomy, clientEmail };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(await readCurrent(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { reportCadence, replyMode, contentAutonomy, clientEmail } = (body ?? {}) as {
    reportCadence?: unknown;
    replyMode?: unknown;
    contentAutonomy?: unknown;
    clientEmail?: unknown;
  };

  // Validate every present key before applying any — a bad value is a 400, not a
  // partial write.
  if (reportCadence !== undefined && !REPORT_CADENCES.has(reportCadence as ReportCadence)) {
    return NextResponse.json({ error: "reportCadence must be 'weekly' or 'monthly'." }, { status: 400 });
  }
  if (replyMode !== undefined && !REPLY_MODES.has(replyMode as ReplyMode)) {
    return NextResponse.json({ error: "replyMode must be 'off', 'approve', or 'auto'." }, { status: 400 });
  }
  if (contentAutonomy !== undefined && !CONTENT_AUTONOMIES.has(contentAutonomy as ContentAutonomy)) {
    return NextResponse.json({ error: "contentAutonomy must be 'auto' or 'approve'." }, { status: 400 });
  }
  if (clientEmail !== undefined && !CLIENT_EMAILS.has(clientEmail as ClientEmailOverride)) {
    return NextResponse.json({ error: "clientEmail must be 'inherit', 'on', or 'off'." }, { status: 400 });
  }

  const applied: string[] = [];
  if (reportCadence !== undefined) {
    await setReportCadence(id, reportCadence as ReportCadence);
    applied.push("reportCadence");
  }
  if (replyMode !== undefined) {
    // Only touch the mode — preserve the client's guidance + example templates.
    const current = await getReplyVoice(id);
    await saveReplyVoice(id, {
      mode: replyMode as ReplyMode,
      guidance: current.guidance,
      templates: current.templates,
    });
    applied.push("replyMode");
  }
  if (contentAutonomy !== undefined) {
    await saveContentAutonomy(id, contentAutonomy as ContentAutonomy);
    applied.push("contentAutonomy");
  }
  if (clientEmail !== undefined) {
    await setClientEmailOverride(id, clientEmail as ClientEmailOverride);
    applied.push("clientEmail");
  }

  if (applied.length > 0) {
    await logAuditEvent({
      tenant: id,
      action: "tenant.operator-settings",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: { fields: applied },
    }).catch(() => {});
  }

  return NextResponse.json(await readCurrent(id));
}
