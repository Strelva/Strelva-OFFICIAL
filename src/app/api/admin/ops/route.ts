import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { buildOpsReport } from "@/lib/ops";

export async function GET() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await buildOpsReport());
}
