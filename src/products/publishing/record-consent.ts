import type { BusinessRecord } from "@/platform/business-record/contracts";

/** The disclosure the owner sees before saving; a flag alone is not consent. */
export function recordGoogleApprovalCopy(record: BusinessRecord, enabled: boolean): string | null {
  return enabled && record.access === "owner"
    ? "Saving your hours, holiday hours, phone, website or description also approves applying those facts to each connected Google listing. Google may hold a change for review. The record stays saved if Google fails."
    : null;
}
