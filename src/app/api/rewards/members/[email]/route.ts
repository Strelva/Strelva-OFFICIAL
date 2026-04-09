import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getMember, getTransactions } from "@/lib/rewards/memberRepositoryKv";
import { KvNotConfiguredError } from "@/lib/rewards/kv";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail);

    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const member = await getMember(tenant, email);
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const transactions = await getTransactions(tenant, email);
    return NextResponse.json({ member, transactions });
  } catch (err) {
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: "kv not configured" }, { status: 503 });
    }
    console.error("[rewards member GET]", err);
    return NextResponse.json({ error: "Failed to load member" }, { status: 500 });
  }
}
