import { z } from 'zod';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
import { businessRecordSchema } from '@/platform/business-record/contracts';
import { selectPublishedBusinessPolicies } from '@/platform/business-record/policies';
export const publicVerificationSchema = z.object({ domain: z.object({ verified: z.boolean(), url: z.string().nullable(), confirmedAt: z.string().nullable() }), googleBusinessProfile: z.object({ linked: z.boolean(), verified: z.boolean().nullable(), url: z.string().nullable() }), ownerConfirmedFactCount: z.number().int().nonnegative(), lastConfirmedAt: z.string().nullable(), operatingAgencies: z.array(z.object({ name: z.string() })) });
export async function publicBusinessProfile(scope: string) {
    const raw = z.object({ workspaceId: z.string().uuid(), revision: z.number(), policyFacts: businessRecordSchema.shape.facts, verification: publicVerificationSchema, facts: z.record(z.string(), z.unknown()), services: z.array(z.object({ name: z.string(), description: z.string().nullable(), priceText: z.string().nullable() })) }).parse(await inquiryRecordsRpc('read_agent_business_profile', { p_scope: scope }));
    return { workspaceId: raw.workspaceId, revision: raw.revision, facts: raw.facts, services: raw.services, policies: selectPublishedBusinessPolicies({ workspaceId: raw.workspaceId, revision: raw.revision, facts: raw.policyFacts }), verification: raw.verification };
}
export const unknownVerification = { domain: { verified: false, url: null, confirmedAt: null }, googleBusinessProfile: { linked: false, verified: null, url: null }, ownerConfirmedFactCount: 0, lastConfirmedAt: null, operatingAgencies: [] };
export type PublicVerification = z.infer<typeof publicVerificationSchema>;
