import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import {
  setLeadWorkflowStatus,
  setLeadDeliveryStage,
  LEAD_WORKFLOW_STATUSES,
  type LeadWorkflowStatus,
} from "@/lib/lead-workflow";
import {
  getDeliveryLeadByToken,
  isDeliveryStatus,
  DELIVERY_STATUSES,
} from "@/lib/access-request-delivery";
import { getRedis } from "@/lib/redis";

/**
 * Operator workflow status for one onboard-form lead — how the operator is
 * working the lead (new / contacted / converted / dismissed), keyed by the
 * lead's stable `statusToken`. Layered ON TOP of the lead record; never touches
 * the Sanity / delivery-lead storage. Super-admin only. Audit-logged.
 *
 * POST { stage, note? } — set the customer-facing delivery stage directly (all
 * six stages + paused), OR { status, note? } — set the coarse workflow bucket.
 * Returns the final workflow state.
 */

const TOKEN_RE = /^[a-f0-9]{36}$/;

function isStatus(value: unknown): value is LeadWorkflowStatus {
  return typeof value === "string" && LEAD_WORKFLOW_STATUSES.includes(value as LeadWorkflowStatus);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid lead token." }, { status: 400 });
  }

  // Verify the token belongs to a known lead before writing any state.
  // Without this a super-admin could silently create orphan Redis keys for
  // non-existent tokens. getDeliveryLeadByToken returns null both when the
  // lead is absent AND when Redis is unavailable — distinguish using getRedis():
  // if Redis is reachable and the lead is still null, the token is genuinely
  // unknown (404). If Redis is unavailable, skip the check and let
  // setLeadWorkflowStatus degrade gracefully (no-op) rather than blocking
  // operators during a transient outage.
  if (getRedis() !== null) {
    const lead = await getDeliveryLeadByToken(token);
    if (lead === null) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { status, stage, note } = (body ?? {}) as {
    status?: unknown;
    stage?: unknown;
    note?: unknown;
  };
  const cleanNote = typeof note === "string" ? note : undefined;

  // A `stage` sets the fine-grained customer-facing delivery stage; a `status`
  // sets the coarse operator bucket. Exactly one is required.
  let workflow;
  let auditValue: string;
  if (stage !== undefined) {
    if (!isDeliveryStatus(stage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${DELIVERY_STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    workflow = await setLeadDeliveryStage(token, stage, cleanNote);
    auditValue = stage;
  } else {
    if (!isStatus(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${LEAD_WORKFLOW_STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    workflow = await setLeadWorkflowStatus(token, status, cleanNote);
    auditValue = status;
  }

  await logAuditEvent({
    // Leads are pre-tenant; logAuditEvent defaults an empty tenant to the
    // control-plane default so the operator action still lands in the trail.
    tenant: "",
    action: "lead.workflow",
    targetType: "lead",
    targetId: token,
    actor: await getActorContext(),
    metadata: { status: auditValue },
  }).catch(() => {});

  return NextResponse.json({ workflow });
}
