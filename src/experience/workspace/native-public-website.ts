import type { PublicContinuation } from "@/platform/infra/public-continuation";

// Recomposition input, never a conversion of an existing saved candidate.
export function nativePublicWebsiteInput(brief: PublicContinuation, workspaceId: string, requestId: string) {
  const description = `${brief.request}\n\nDesired result: ${brief.result}\n\nScope: ${brief.scope}\n\nPrimary call to action: Contact us`;
  if (description.length > 4_000) {
    throw new Error("This brief is too long to start a website draft. Save the private brief and shorten the website request first. Your brief is unchanged.");
  }
  return { workspaceId, requestId, businessName: brief.businessName, description };
}
