import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";

/** Support inspection grants no authority to change client work. */
async function refuseClientWrite() {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Publish client sites through ordinary business or verified agency access. Nothing changed." }, { status: 410 });
}
export async function POST(_request: Request, _context: { params: Promise<{ id: string }> }) { return refuseClientWrite(); }
