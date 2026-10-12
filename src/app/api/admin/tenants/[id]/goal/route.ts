import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";

/** Support inspection grants no authority to change client work. */
async function refuseClientWrite() {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Set goals through ordinary business or agency access. Nothing changed." }, { status: 410 });
}
export async function PUT(_request: Request, _context: { params: Promise<{ id: string }> }) { return refuseClientWrite(); }
export async function DELETE(_request: Request, _context: { params: Promise<{ id: string }> }) { return refuseClientWrite(); }
