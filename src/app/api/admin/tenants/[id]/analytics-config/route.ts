import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";

/** Client connection settings belong to ordinary business or agency access. */
export async function POST(_request: Request, _context: { params: Promise<{ id: string }> }) {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Configure client analytics through ordinary business or agency access. Nothing changed." }, { status: 410 });
}
