import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";

const contextSchema = z.object({
  workspaceId: z.string().uuid().nullable(),
  tenantIds: z.array(z.string().min(1)),
  ownerAuthorship: z.enum(["platform", "agency"]).nullable(),
  businessName: z.string().trim().min(1).max(200).regex(/^[^\r\n\x00-\x1f\x7f]+$/).nullable(),
  replyTo: z.string().email().nullable(),
  timeZone: z.string().nullable(),
}).refine(context => context.workspaceId !== null || (context.ownerAuthorship === null && context.businessName === null && context.replyTo === null), "A legacy scope cannot claim business identity or platform authorship.");
export type EmailBusinessContext = z.infer<typeof contextSchema>;
export type EmailBusinessScope = { workspaceId?: string; tenantId?: string };

/** Service-only read. A failed lookup is unknown, never a direct business or
 * a fabricated business identity. No browser-supplied identity is accepted. */
export async function resolveEmailBusinessContext(scope: EmailBusinessScope): Promise<EmailBusinessContext | null> {
  try {
    const db = getSupabase();
    if (!db || (!scope.workspaceId && !scope.tenantId)) return null;
    const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> })
      .rpc("read_email_business_context", { p_workspace_id: scope.workspaceId ?? null, p_tenant_id: scope.tenantId ?? null });
    if (error) return null;
    const parsed = contextSchema.safeParse(data);
    if (!parsed.success || (scope.workspaceId && parsed.data.workspaceId !== scope.workspaceId)
      || (scope.tenantId?.startsWith("workspace:") && scope.tenantId.slice(10) !== parsed.data.workspaceId)
      || (scope.tenantId && !scope.tenantId.startsWith("workspace:") && !parsed.data.tenantIds.includes(scope.tenantId))) return null;
    return parsed.data;
  } catch { return null; }
}
