/**
 * Server entry for the Google listing System. Callers outside the product
 * import through here (src/products/README boundary rule).
 */
export { defaultTenantReplyDeps, postTenantReviewReply, routeTenantReviewReply } from "./tenant-replies";
export type { TenantReplyDeps, TenantReplyResult, TenantReplyRoute } from "./tenant-replies";


export { listingDraftingAllowed } from "./poll-policy";
export { readListingControl, setListingPaused, noteListingAccess } from "./controls";


export type { RecordInfo } from "./record";

export { googleDraftInputSchema } from "./contracts";

export const executeGoogleListingEvent = async (...args: Parameters<typeof import("./workspace").executeGoogleListingEvent>) => (await import("./workspace")).executeGoogleListingEvent(...args);

export const prepareGoogleListingDraft = async (...args: Parameters<typeof import("./workspace").prepareGoogleListingDraft>) => (await import("./workspace")).prepareGoogleListingDraft(...args);

export const tenantListingContext = async (...args: Parameters<typeof import("./workspace").tenantListingContext>) => (await import("./workspace")).tenantListingContext(...args);

export const readWorkspaceGoogle = async (...args: Parameters<typeof import("./workspace").readWorkspaceGoogle>) => (await import("./workspace")).readWorkspaceGoogle(...args);

export const undoWorkspaceGoogleChange = async (...args: Parameters<typeof import("./workspace").undoWorkspaceGoogleChange>) => (await import("./workspace")).undoWorkspaceGoogleChange(...args);

export const changeWorkspaceGoogleReply = async (...args: Parameters<typeof import("./workspace").changeWorkspaceGoogleReply>) => (await import("./workspace")).changeWorkspaceGoogleReply(...args);
