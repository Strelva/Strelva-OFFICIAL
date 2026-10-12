export type LeadWorkflowStatus = "new" | "contacted" | "converting" | "converted" | "dismissed";

export interface LeadWorkflow {
  token: string;
  status: LeadWorkflowStatus;
  note?: string;
  notes?: { id: string; text: string; createdAt: string; createdBy: string }[];
  updatedAt: string | null;
}
