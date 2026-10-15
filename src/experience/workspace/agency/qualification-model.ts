import { z } from "zod";
import type { AgencyEffect } from "@/platform/workspaces/agency-onboarding";

const AGENCY_EFFECTS = ["publish", "google", "email", "payments"] as const;

export const qualificationRequirements: Record<AgencyEffect, { name: string; requirements: string[] }> = {
  publish: { name: "Publishing", requirements: ["A working website preview and a test result.", "How you establish domain authority, verify a release and undo it."] },
  google: { name: "Google", requirements: ["Evidence of an authorized Google Business Profile connection.", "A rehearsal showing owner review, verification and recovery of a change."] },
  email: { name: "Email", requirements: ["A verified sender and monitored reply-to address.", "A rehearsal showing consent, exclusions and unsubscribe handling."] },
  payments: { name: "Payments", requirements: ["Evidence of payment-account readiness and the responsible business.", "Customer-visible terms and a rehearsal of cancellation, refunds and reconciliation."] },
};
export const qualificationSubmissionSchema = z.object({
  action: z.literal("submit"), workspaceId: z.string().uuid(), requestId: z.string().uuid(), effect: z.enum(AGENCY_EFFECTS),
  evidenceUrl: z.string().url().max(2000).refine(value => new URL(value).protocol === "https:", "Use an HTTPS evidence link."),
  evidence: z.string().trim().min(20).max(6000),
}).strict();
export const qualificationDecisionSchema = z.object({
  action: z.literal("decide"), submissionId: z.string().uuid(), decision: z.enum(["verified", "changes_requested", "unavailable"]),
  reason: z.string().trim().min(10).max(500),
}).strict();
export const qualificationRecordSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), agencyName: z.string(), effect: z.enum(AGENCY_EFFECTS),
  evidenceUrl: z.string(), evidence: z.string(), submittedAt: z.string(), submittedBy: z.string().uuid(),
  decision: z.enum(["verified", "changes_requested", "unavailable"]).nullable(), reason: z.string().nullable(),
  decidedAt: z.string().nullable(), decidedBy: z.string().uuid().nullable(),
  canReview: z.boolean().optional(),
});
export const qualificationStateSchema = z.object({
  workspaceId: z.string().uuid(), canSubmit: z.boolean(), independentReviewerAvailable: z.boolean().optional(), submissions: z.array(qualificationRecordSchema),
  effects: z.array(z.object({ effect: z.enum(AGENCY_EFFECTS), available: z.boolean() })),
});
export type QualificationState = z.infer<typeof qualificationStateSchema>;
export type QualificationRecord = z.infer<typeof qualificationRecordSchema>;
