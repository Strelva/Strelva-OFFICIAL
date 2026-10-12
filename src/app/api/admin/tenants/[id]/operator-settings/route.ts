import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { getReportCadence, setReportCadence, type ReportCadence } from "@/lib/report-cadence";
import { getReplyVoice, type ReplyMode } from "@/lib/reviews/reply-voice";
import {
  getContentAutonomy,
  type ContentAutonomy,
} from "@/lib/content-autonomy";
import {
  getClientEmailOverride,
  setClientEmailOverride,
  type ClientEmailOverride,
} from "@/platform/infra/email/client-override";

/**
 * Platform reporting cadence and email delivery controls. GET also exposes
 * recorded reply/content policy for support inspection; POST refuses policy
 * keys before applying any other fields. Client policy uses ordinary access.
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
  await authorizeAdminOperatorRead("admin.tenant-controls.read");
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

  if (replyMode !== undefined || contentAutonomy !== undefined) {
    return NextResponse.json({ error: "Client automation policy requires ordinary business or agency access. Nothing changed." }, { status: 403 });
  }

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
  await applySettings(id, { reportCadence, clientEmail }, applied);

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

/** Only platform reporting and email controls can change here. */
async function applySettings(
  id: string,
  { reportCadence, clientEmail }: { reportCadence?: unknown; clientEmail?: unknown },
  applied: string[],
) {
  if (reportCadence !== undefined) {
    await setReportCadence(id, reportCadence as ReportCadence);
    applied.push("reportCadence");
  }
  if (clientEmail !== undefined) {
    await setClientEmailOverride(id, clientEmail as ClientEmailOverride);
    applied.push("clientEmail");
  }
}
