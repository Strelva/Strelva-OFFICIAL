export type LeadWorkflowStatus = "new" | "contacted" | "converting" | "converted" | "dismissed";

export interface LeadWorkflow {
  token: string;
  status: LeadWorkflowStatus;
  note?: string;
  updatedAt: string | null;
}
