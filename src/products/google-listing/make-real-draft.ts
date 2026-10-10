import { createHash } from "node:crypto";
import { canonicalJson } from "@/platform/business-record/tenant-import";
/** Hash content and source/authority pins; execution markers are mutable receipts. */
export function googleMakeRealDraftDigest(metadata: Record<string, unknown>): string {
 return createHash("sha256").update(canonicalJson({workspaceId:metadata.workspaceId,locationId:metadata.locationId,draft:metadata.draft,recordRevision:metadata.recordRevision??null,version:metadata.version??null,maintenance:metadata.maintenance??null,...(metadata.nativeGrant?{nativeGrant:metadata.nativeGrant}:{})})).digest("hex");
}
