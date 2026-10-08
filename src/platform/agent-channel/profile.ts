import { z } from 'zod';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
import { businessRecordSchema } from '@/platform/business-record/contracts';
import { selectPublishedBusinessPolicies } from '@/platform/business-record/policies';
import { publicVerificationSchema } from "./contracts";
export { publicVerificationSchema, unknownVerification, type PublicVerification } from "./contracts";
export async function publicBusinessProfile(scope: string) {
    const raw = z.object({ workspaceId: z.string().uuid(), revision: z.number(), policyFacts: businessRecordSchema.shape.facts, verification: publicVerificationSchema, facts: z.record(z.string(), z.unknown()), services: z.array(z.object({ name: z.string(), description: z.string().nullable(), priceText: z.string().nullable() })) }).parse(await inquiryRecordsRpc('read_agent_business_profile', { p_scope: scope }));
    return { workspaceId: raw.workspaceId, revision: raw.revision, facts: raw.facts, services: raw.services, policies: selectPublishedBusinessPolicies({ workspaceId: raw.workspaceId, revision: raw.revision, facts: raw.policyFacts }), verification: raw.verification };
}
