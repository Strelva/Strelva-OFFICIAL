import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { requireTenantAccess } from "@/platform/infra/auth";
import { getRateLimitStatusAsync } from "@/platform/infra/rate-limit";
import { getTenantFromHeaders } from "@/lib/tenant";

const AGENT_REQUEST_LIMIT_PER_MINUTE = 30;

export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  await authorizeTenantOperatorRead(tenant);

  const usage = await getRateLimitStatusAsync(
    `agent:${tenant}`,
    AGENT_REQUEST_LIMIT_PER_MINUTE,
  );

  return Response.json(usage);
}
