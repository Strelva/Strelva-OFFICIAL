import { NextResponse } from "next/server";
import { addEvent, getOpenChangeRequest } from "@/lib/events";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission, verifyAuth, isSuperAdmin } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import { getTenantConfig } from "@/lib/tenants";
import {
  getCustomRepoMetadata,
  getTenantDeliveryModel,
  getTriageDueAt,
} from "@/lib/custom-repos";

const REQUEST_KINDS = new Set(["custom_design", "template", "infrastructure"]);

function getRequestKind(value: unknown): "custom_design" | "template" | "infrastructure" {
  return typeof value === "string" && REQUEST_KINDS.has(value)
    ? value as "custom_design" | "template" | "infrastructure"
    : "custom_design";
}

function getTitlePrefix(requestKind: "custom_design" | "template" | "infrastructure") {
  if (requestKind === "template") return "Requested template change";
  if (requestKind === "infrastructure") return "Requested infrastructure change";
  return "Requested custom change";
}

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Describe the requested change" }, { status: 400 });
    }

    // Care-plan rule: one active custom request at a time. Super-admins (Jacob)
    // are never blocked — they manage the queue. For owners, surface a friendly
    // 409 that names what's already in flight so the AI can offer to fold this
    // in or wait, rather than silently stacking a second job.
    if (!(await isSuperAdmin())) {
      const open = await getOpenChangeRequest(tenant);
      if (open) {
        return NextResponse.json(
          {
            error: "active_request_exists",
            message:
              "You already have a custom request in progress, so I'm keeping it to one at a time. " +
              "Want me to add this to that one, or hold it until the first wraps up?",
            activeRequest: {
              id: open.id,
              title: open.title,
              requestedAt:
                (open.metadata?.requestedAt as string | undefined) ?? open.createdAt,
            },
          },
          { status: 409 }
        );
      }
    }

    const section = typeof body.section === "string" ? body.section : undefined;
    const field = typeof body.field === "string" ? body.field : undefined;
    const page = typeof body.page === "string" ? body.page : undefined;
    const label = typeof body.label === "string" ? body.label : undefined;
    const nodeType = typeof body.nodeType === "string" ? body.nodeType : undefined;
    const requestKind = getRequestKind(body.requestKind);
    const rect = body.rect && typeof body.rect === "object" && !Array.isArray(body.rect)
      ? body.rect
      : undefined;
    const tenantConfig = await getTenantConfig(tenant);
    const deliveryModel = getTenantDeliveryModel(tenantConfig);
    const customRepo = getCustomRepoMetadata(tenantConfig);
    const requestedAt = new Date();

    const event = await addEvent({
      tenantId: tenant,
      source: "website",
      type: "change_request",
      title: label ? `${getTitlePrefix(requestKind)}: ${label}` : `${getTitlePrefix(requestKind)} for site`,
      body: prompt,
      status: "pending",
      metadata: {
        page,
        section,
        field,
        label,
        nodeType,
        rect,
        kind: "custom_code_or_design_request",
        requestKind,
        workflowStatus: "requested",
        requestedAt: requestedAt.toISOString(),
        triageDueAt: getTriageDueAt(requestedAt),
        deliveryModel,
        customRepo: deliveryModel === "custom_repo" ? {
          repoName: customRepo.repoName,
          repoUrl: customRepo.repoUrl,
          localPath: customRepo.localPath,
          productionUrl: customRepo.productionUrl,
          contractVersion: customRepo.contractVersion,
        } : undefined,
        complexity: "unclear",
        quoteRequired: true,
      },
    });

    return NextResponse.json({ success: true, event });
  } catch (err) {
    console.error("[change-requests POST]", err);
    return NextResponse.json({ error: "Failed to create change request" }, { status: 500 });
  }
}
