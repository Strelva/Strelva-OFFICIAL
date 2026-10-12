import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";

/** Legacy sales/delivery records are inspected by support, never worked as platform staff. */
export async function POST(_request: Request, _context: { params: Promise<{ token: string }> }) {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Agency sales and delivery updates require ordinary agency access. Nothing changed." }, { status: 410 });
}
