import { NextResponse } from "next/server";
import { isSuperAdmin, getCurrentUserEmail } from "@/lib/auth";
import { listPendingDigests, decideMaintenanceDigest } from "@/lib/maintenance-digest";

/** GET — all pending maintenance digests for operator review. */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ digests: await listPendingDigests() });
}

/** POST { tenant, decision: "approved" | "dismissed" } — operator decision. */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const tenant = body?.tenant;
  const decision = body?.decision;
  if (typeof tenant !== "string" || (decision !== "approved" && decision !== "dismissed")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const by = (await getCurrentUserEmail()) || "operator";
  const digest = await decideMaintenanceDigest(tenant, decision, by);
  if (!digest) {
    return NextResponse.json({ error: "No pending digest for this tenant" }, { status: 404 });
  }
  return NextResponse.json({ digest });
}
