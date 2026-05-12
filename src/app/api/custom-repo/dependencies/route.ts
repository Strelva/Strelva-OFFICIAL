import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import {
  getBlockingCustomRepoDependencies,
  getCustomRepoDependencies,
  getTenantDeliveryModel,
  getWorstCustomRepoDependencyStatus,
} from "@/lib/custom-repos";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const config = await getTenantConfig(tenant);
    if (!config) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const dependencies = getCustomRepoDependencies(config);
    const blockingDependencies = getBlockingCustomRepoDependencies(config);
    const summary = getWorstCustomRepoDependencyStatus(dependencies);

    return NextResponse.json({
      tenant,
      deliveryModel: getTenantDeliveryModel(config),
      dependencies,
      blockingDependencies,
      hasBlockingDependency: blockingDependencies.length > 0,
      summary,
    });
  } catch (err) {
    console.error("[custom-repo dependencies GET]", err);
    return NextResponse.json({ error: "Failed to load dependency health" }, { status: 500 });
  }
}
