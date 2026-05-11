import { requireTenantAccess } from "@/lib/auth";
import { getRateLimitStatusAsync } from "@/lib/rate-limit";
import { getTenantFromHeaders } from "@/lib/tenant";

const AGENT_REQUEST_LIMIT_PER_MINUTE = 30;

export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const usage = await getRateLimitStatusAsync(
    `agent:${tenant}`,
    AGENT_REQUEST_LIMIT_PER_MINUTE,
  );

  return Response.json(usage);
}
