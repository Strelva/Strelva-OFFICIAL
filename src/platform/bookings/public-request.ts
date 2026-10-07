import { createHash, createHmac } from "node:crypto";
import { PublicBookingError } from "./errors";

/** Tenant-scoped durable request identity. The customer link stays secret even
 * though the caller supplies the request id. Competing identical submits use
 * the same receipt and token rather than replacing each other's bearer link. */
export function publicRecordReservationId(tenantStableId: string, requestId: string): string {
  const hash = createHash("sha256").update(JSON.stringify([tenantStableId, requestId])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function publicRecordManagementToken(tenantStableId: string, requestId: string): string {
  const key = process.env.SECRETS_ENC_KEY;
  if (!key) throw new PublicBookingError("unavailable", "Booking token encryption is not configured. Nothing was booked.");
  return createHmac("sha256", key).update(JSON.stringify([tenantStableId, requestId])).digest("base64url");
}
