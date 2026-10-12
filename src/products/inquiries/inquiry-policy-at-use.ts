import { z } from "zod";
import { commitmentSignals, evaluateRoute, type Route, type PolicySetting } from "@/platform/needs-you";
import { systemOriginId } from "@/platform/systems/invariants";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import type { ResponsibilityEvaluation } from "./contracts";

const currentPolicy = z.object({ workspaceId: z.string().uuid(), inquiryWorkspaceId: z.string().uuid().nullable(),
  policies: z.array(z.object({ systemId: z.string().uuid().nullable(), route: z.enum(["handle", "handle_after_notice", "strelva_reviews", "owner_decides"]) })) });

export type InquiryMessageRouteReader = (tenantId: string, evaluation: ResponsibilityEvaluation, message: string, businessId?: string) => Promise<Route>;

/** At-use policy for a trusted, tenant-scoped message. Settings never grant
 * trust; only the canonical engine evaluation does. Missing current policy
 * closes autonomous handling without claiming a message was sent. */
export const inquiryMessageRouteAtUse: InquiryMessageRouteReader = async (tenantId, evaluation, message, businessId) => {
  const kind = commitmentSignals(message).length ? "customer.commitment" : "customer.message";
  if (kind === "customer.commitment") return "owner_decides";
  if (evaluation.decision === "block") return "never";
  if (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1" || !inquiryRecordsEnabled()) {
    return evaluateRoute({ kind, origin: "strelva", signals: { inquiryDecision: evaluation.decision } }).route;
  }
  try {
    if (!businessId) return "owner_decides";
    const raw = await inquiryRecordsRpc("read_inquiry_message_owner_policy", { p_tenant_id: tenantId, p_business_id: businessId });
    if (raw === null) return evaluateRoute({ kind, origin: "strelva", signals: { inquiryDecision: evaluation.decision } }).route;
    const policy = currentPolicy.parse(raw);
    const systemId = policy.inquiryWorkspaceId ? systemOriginId(policy.workspaceId, { kind: "inquiry_workspace", ref: policy.inquiryWorkspaceId }) : null;
    const policies: PolicySetting[] = policy.policies.map(row => ({ ...row, kind, layer: "owner" }));
    return evaluateRoute({ kind, origin: "strelva", systemId, policies, signals: { inquiryDecision: evaluation.decision } }).route;
  } catch { return "owner_decides"; }
};
