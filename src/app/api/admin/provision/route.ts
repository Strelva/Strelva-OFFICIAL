import { NextResponse } from "next/server";
import { getActorContext, isSuperAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { provisionTenant } from "@/lib/provisioning";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const subdomain = clean(body.subdomain).toLowerCase();
  const siteName = clean(body.siteName);
  const ownerName = clean(body.ownerName);
  const industry = clean(body.industry);

  if (!subdomain || !siteName || !ownerName || !industry) {
    return NextResponse.json(
      { error: "subdomain, siteName, ownerName, and industry are required" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9-]{2,63}$/.test(subdomain) || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    return NextResponse.json(
      { error: "subdomain must be 2-63 lowercase letters, numbers, or hyphens" },
      { status: 400 }
    );
  }

  const result = await provisionTenant({
    subdomain,
    siteName,
    ownerName,
    ownerEmail: clean(body.ownerEmail) || undefined,
    industry,
    template: clean(body.template) || undefined,
    productionDomain: clean(body.productionDomain) || undefined,
    adminDomain: clean(body.adminDomain) || undefined,
  });

  await logAuditEvent({
    tenant: result.tenantId,
    action: "tenant.provision",
    targetType: "tenant",
    targetId: result.tenantId,
    actor: await getActorContext(result.tenantId),
    metadata: { steps: result.steps.map((s) => ({ key: s.key, status: s.status })) },
  });

  return NextResponse.json(result);
}
