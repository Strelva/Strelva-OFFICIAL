/**
 * Server entry for the Google listing System. Callers outside the product
 * import through here (src/products/README boundary rule).
 */
export { defaultTenantReplyDeps, postTenantReviewReply, routeTenantReviewReply } from "./tenant-replies";
export type { TenantReplyDeps, TenantReplyResult, TenantReplyRoute } from "./tenant-replies";
