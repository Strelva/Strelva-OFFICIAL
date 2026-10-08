import { z } from "zod";
import { inquiryRecordsRpc } from "./inquiry-records";
import { workspaceReleaseOn } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";

export const inquiryFactProposalSchema = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), key: z.string(), value: z.unknown(), provenance: z.string(), revisionHash: z.string().regex(/^[a-f0-9]{64}$/) });
export type InquiryFactProposal = z.infer<typeof inquiryFactProposalSchema>;

export async function inquiryFactProposalsEnabled(workspaceId: string, actorId?: string) {
  if (process.env.STRELVA_INQUIRY_BUSINESS_FACTS !== "1") return false;
  if (!workspaceReleaseOn(process.env)) return process.env.STRELVA_INQUIRIES_RELEASE === "1";
  return workspaceReleaseFlagEnabled("inquiries", workspaceId, actorId ? { userId: actorId, operator: false, tester: false } : undefined, process.env);
}

export async function readInquiryFactProposals(workspaceId: string, actorId: string): Promise<InquiryFactProposal[]> {
  if (!await inquiryFactProposalsEnabled(workspaceId, actorId)) return [];
  return z.array(inquiryFactProposalSchema).parse(await inquiryRecordsRpc("read_inquiry_business_facts", { p_workspace_id: workspaceId, p_user_id: actorId }));
}

export async function inquiryFactRevision(workspaceId: string, proposalId: string): Promise<string | null> {
  if (!await inquiryFactProposalsEnabled(workspaceId)) return null;
  const raw = await inquiryRecordsRpc("inquiry_business_fact_revision", { p_workspace_id: workspaceId, p_proposal_id: proposalId });
  return typeof raw === "string" ? raw : null;
}

export async function confirmInquiryFact(workspaceId: string, proposalId: string, itemId: string, revision: string) {
  if (!await inquiryFactProposalsEnabled(workspaceId)) throw new Error("inquiries_disabled");
  return inquiryRecordsRpc("confirm_inquiry_business_fact", { p_workspace_id: workspaceId, p_proposal_id: proposalId, p_decision_id: itemId, p_revision_hash: revision });
}
