import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { listPendingDigests } from "@/lib/maintenance-digest";

/** GET — all pending maintenance digests for operator review. */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await authorizeAdminOperatorRead("admin.digests.read");
  return NextResponse.json({ digests: await listPendingDigests() });
}

/** Platform support can inspect proposed upkeep, but cannot author client
 * suggestions or decide client content under operator privileges. */
export async function POST() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Client content decisions belong to the business owner or its authorized agency.", code: "client_content_decision_required" }, { status: 410 });
}
