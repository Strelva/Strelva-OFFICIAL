/**
 * Authorize a v1 public-read preview request. `?preview=true` returns draft
 * content, so a bare query param is not enough — the request must carry a valid
 * HMAC preview token (signed with the tenant's revalidationSecret). Without it,
 * the route serves PUBLISHED content. Centralized so every v1 route gates preview
 * identically. See signPreviewToken/verifyPreviewToken in scaffold-contracts.ts.
 */
import {
  verifyPreviewToken,
  PREVIEW_TIMESTAMP_HEADER,
  PREVIEW_SIGNATURE_HEADER,
} from "./scaffold-contracts";

export function isAuthorizedPreview(
  request: Request,
  tenant: string,
  revalidationSecret: string | null | undefined
): boolean {
  if (new URL(request.url).searchParams.get("preview") !== "true") return false;
  if (!revalidationSecret) return false;
  return verifyPreviewToken(
    tenant,
    revalidationSecret,
    request.headers.get(PREVIEW_TIMESTAMP_HEADER),
    request.headers.get(PREVIEW_SIGNATURE_HEADER)
  );
}
