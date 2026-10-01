export {
  WEBSITE_PRODUCT_ID,
  WEBSITE_RESOURCE_KIND,
  WEBSITE_VERSION,
  approveWebsiteInputSchema,
  connectWebsiteCapabilitiesInputSchema,
  createWebsiteInputSchema,
  publishWebsiteInputSchema,
  reviseWebsiteInputSchema,
  takeWebsiteOfflineInputSchema,
  websiteArtifactSchema,
  websiteCapabilityOptionsSchema,
  websiteCapabilitySelectionSchema,
  websiteBriefSchema,
  websiteLaunchReceiptSchema,
  websiteLifecycleSchema,
  websitePublishedCapabilitiesSchema,
  websiteSchema,
  websiteSpecSchema,
} from "./contracts";
export type {
  ApproveWebsiteInput,
  ConnectWebsiteCapabilitiesInput,
  CreateWebsiteInput,
  PublishWebsiteInput,
  ReviseWebsiteInput,
  TakeWebsiteOfflineInput,
  Website,
  WebsiteArtifact,
  WebsiteCapabilityOptions,
  WebsiteCapabilitySelection,
  WebsiteBrief,
  WebsiteLaunch,
  WebsiteLaunchReceipt,
  WebsitePublication,
  WebsiteLifecycle,
  WebsitePreview,
  WebsitePublishedCapabilities,
  WebsiteRecord,
  WebsiteSpec,
} from "./contracts";

export const WEBSITE_API_PATH = "/api/websites" as const;

export type WebsiteCreateRequest = {
  action: "create";
  workspaceId: string;
  requestId: string;
  brief: import("./contracts").WebsiteBrief;
};

export type WebsiteMutationRequest =
  | ({ action: "revise"; } & import("./contracts").ReviseWebsiteInput)
  | ({ action: "approve"; } & import("./contracts").ApproveWebsiteInput)
  | ({ action: "publish"; } & import("./contracts").PublishWebsiteInput)
  | ({ action: "takeOffline"; } & import("./contracts").TakeWebsiteOfflineInput);

export function websiteWorkPath(workId: string): string {
  return `${WEBSITE_API_PATH}/${encodeURIComponent(workId)}`;
}

export function createWebsiteRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `website-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function websitePreviewIsCurrent(website: import("./contracts").Website): boolean {
  const candidate = website.candidate;
  return Boolean(candidate && candidate.preview.revision === candidate.revision && candidate.preview.contentHash === candidate.contentHash);
}
