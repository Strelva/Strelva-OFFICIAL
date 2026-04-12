import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getSuggestions, updateSuggestion } from "@/lib/suggestions";
import { requireActiveSubscription } from "@/lib/subscription";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const suggestions = await getSuggestions(tenant);
  return NextResponse.json({ suggestions });
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const { suggestionId, status } = await req.json();

  if (!suggestionId || !["accepted", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updated = await updateSuggestion(tenant, suggestionId, status);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ suggestion: updated });
}
