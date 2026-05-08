import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { logActivity } from "@/lib/storage";

const OFFBOARDING_STEPS = [
  "Export content JSON and asset manifest.",
  "Move DNS to the next provider after the new site is ready.",
  "Open billing portal and cancel the subscription when handoff timing is confirmed.",
  "Remove Scaffold Web custom domains after traffic points away.",
  "Revoke Scaffold Web admin access in domain registrar, Google Business Profile, booking, social, and email tools.",
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

  await logActivity(
    {
      text: "Offboarding handoff requested from Ownership Center",
      time: new Date().toISOString(),
      type: "handoff",
      actor: "user",
      section: "ownership-center",
      suppressEvent: true,
      snapshot: { notes, steps: OFFBOARDING_STEPS },
    },
    tenant,
  );

  return NextResponse.json({
    ok: true,
    message: "Offboarding handoff request recorded.",
    nextSteps: OFFBOARDING_STEPS,
  });
}
