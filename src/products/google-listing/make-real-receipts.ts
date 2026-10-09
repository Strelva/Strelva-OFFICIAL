import { canonicalJson } from "@/platform/business-record/tenant-import";
import type { ListingReceipt } from "./contracts";

const intent = (receipt: ListingReceipt) => canonicalJson({
  workspaceId: receipt.workspaceId, bindingId: receipt.bindingId,
  locationId: receipt.locationId, action: receipt.action, targetRef: receipt.targetRef,
  authority: receipt.authority, intentDigest: receipt.intentDigest,
  undoesReceiptId: receipt.undoesReceiptId,
});

/** Follow exactly the retry keys used by governedWrite, without creating rows. */
export async function readGoogleMakeRealReceipt(
  rootKey: string, read: (key: string) => Promise<ListingReceipt | null>,
): Promise<ListingReceipt | null> {
  const root = await read(rootKey);
  if (!root) return null;
  if (root.idempotencyKey !== rootKey) throw new Error("Google receipt identity changed.");
  let current = root;
  for (let retry = 0; current.status === "failed" && retry < 20; retry += 1) {
    const retryKey = `${rootKey}:retry:${current.id}`;
    const next = await read(retryKey);
    if (!next) return current;
    if (!root.intentDigest || !next.intentDigest || next.idempotencyKey !== retryKey || intent(next) !== intent(root)) throw new Error("Google retry receipt identity changed.");
    current = next;
  }
  return current;
}
