import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { inquiryBusinessFactsEnabled } from "./business-context";
import type { InquirySetupFacts } from "./contracts";
import { inquiryReleaseEnabledForWorkspace } from "./release";
import type { InquiryBusinessContext } from "./business-context";

export { inquiryFactProposalSchema, readInquiryFactProposals } from "@/platform/infra/inquiry-fact-proposals";
export type { InquiryFactProposal } from "@/platform/infra/inquiry-fact-proposals";

/** Scans only suggest facts that fit the business record's typed contract.
 * Hours without a timezone and headcounts without identified people remain
 * evidence for the operator, never facts or permission inferred from a page. */
export function inquiryScanFactSuggestions(facts: InquirySetupFacts): Array<{ key: string; value: unknown; provenance: string }> {
  return facts.statements.flatMap<{ key: string; value: unknown; provenance: string }>(statement => {
    if (!statement.value || !statement.provenance) return [];
    if (statement.id === "business") return [{ key: "display_name", value: statement.value, provenance: statement.provenance }];
    if (statement.id === "website") return [{ key: "links", value: [{ kind: "website", url: statement.value }], provenance: statement.provenance }];
    return [];
  });
}

export async function stageInquiryScanFacts(workspaceId: string, actorId: string, facts: InquirySetupFacts) {
  if (!inquiryBusinessFactsEnabled() || !await inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actorId, operator: false, tester: false })) return;
  for (const fact of inquiryScanFactSuggestions(facts)) await inquiryRecordsRpc("stage_inquiry_business_fact", { p_workspace_id: workspaceId, p_user_id: actorId, p_key: fact.key, p_value: fact.value, p_provenance: fact.provenance });
}

/** This projection reads the shared record on every use; inquiry receipts are
 * evidence of the old scan, never another current business profile. */
export function inquiryRecordOnboarding(context: InquiryBusinessContext): InquirySetupFacts {
  const links = Array.isArray(context.facts.links?.value) ? context.facts.links.value as Array<{ kind?: string; url?: string }> : [];
  const website = links.find(link => link.kind === "website")?.url ?? null;
  const rows = [{ id: "business", label: "Business name", fact: context.facts.display_name },
    { id: "hours", label: "Opening hours", fact: context.facts.hours }];
  return { website, statements: [{ id: "website", label: "Website", value: website, provenance: "Business details", editable: true, confirmed: context.facts.links?.verified === true },
    ...rows.map(row => ({ id: row.id, label: row.label, value: row.fact ? typeof row.fact.value === "string" ? row.fact.value : JSON.stringify(row.fact.value) : null,
      provenance: "Business details", editable: row.id === "business", confirmed: row.fact?.verified === true }))],
    checks: [{ id: "business-record", label: "Business details", status: "passed", detail: "Reads the current business record. Unknown or unconfirmed details are marked above; scans still need your decision." }] };
}

export async function correctInquiryBusinessFact(workspaceId: string, actorId: string, statementId: string, value: string) {
  if (!inquiryBusinessFactsEnabled() || !await inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actorId, operator: false, tester: false })) return false;
  const key = statementId === "business" ? "display_name" : statementId === "website" ? "links" : null;
  if (!key) throw new Error("Edit this detail in Business details so its complete facts stay together.");
  await inquiryRecordsRpc("correct_inquiry_business_fact", { p_workspace_id: workspaceId, p_user_id: actorId, p_key: key,
    p_value: key === "links" ? [{ kind: "website", url: value }] : value });
  return true;
}
