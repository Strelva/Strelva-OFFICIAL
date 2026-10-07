/** Anonymous booking admission: SQL owns caps; the email-only token owns placement. */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import type { PublicBookingAdmission } from "./public-request";
import { PublicBookingError } from "./errors";
import { nativeRpc, tokenHash } from "./native";
import { bookingCustomerEmailAllowed } from "./updates";
import { bookingAppOrigin } from "./lifecycle-ports";

const requestSchema = z.object({ tenantId: z.string(), requestId: z.string(),
  visitor: z.object({ name: z.string(), email: z.string().email(), phone: z.string().optional(), message: z.string().optional(), intakeAnswers: z.record(z.string(), z.string()).optional() }),
  token_ciphertext: z.string(), state: z.string(), expires_at: z.string() });

export const publicBookingAdmission: PublicBookingAdmission = {
  async claim(input) {
    if (!await bookingCustomerEmailAllowed(input.binding.tenantId)) throw new PublicBookingError("unavailable", "Email confirmation is not available. Contact the business to book.");
    const token = randomBytes(32).toString("base64url");
    await nativeRpc("claim_public_booking_request", { p_tenant_id: input.binding.tenantId, p_request: {
      workspaceId: input.binding.workspaceId, requestId: input.requestId, fingerprint: input.fingerprint,
      visitor: input.visitor, start: input.start, end: input.end,
      tokenHash: tokenHash(token), tokenCiphertext: encryptSecret(token),
    } });
  },
  async send(input) {
    const raw = await nativeRpc("read_public_booking_request", { p_tenant_id: input.tenantId, p_request_id: input.requestId });
    const row = requestSchema.parse(raw);
    if (row.state !== "held" || Date.parse(row.expires_at) <= Date.now()) return;
    const token = decryptSecret(row.token_ciphertext);
    if (!token) throw new PublicBookingError("unavailable", "The confirmation email is unavailable.");
    const result = await sendEmailWithReceipt({ audience: "customer", tenantId: input.tenantId, to: row.visitor.email,
      fromName: "Strelva Bookings", fromAddress: "bookings@mail.strelva.com", subject: "Confirm your booking request",
      idempotencyKey: `public-booking-confirm:${tokenHash(token)}`,
      options: { heading: "Confirm your booking request", paragraphs: ["Confirm within 15 minutes. Nothing is booked until you confirm your email."],
        button: { label: "Review and confirm", url: `${bookingAppOrigin()}/booking-confirm/${token}` } } });
    if (result.status !== "accepted") throw new PublicBookingError("unavailable", "The confirmation email could not be sent. Contact the business to book.");
  },
  async consume(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PublicBookingError("not_found", "This confirmation link is unavailable.");
    return requestSchema.parse(await nativeRpc("consume_public_booking_request", { p_hash: tokenHash(token) }));
  },
  async placed(input) { await nativeRpc("finish_public_booking_request", { p_tenant_id: input.tenantId, p_request_id: input.requestId }); },
  async verified(input) {
    const raw = await nativeRpc("read_public_booking_request", { p_tenant_id: input.tenantId, p_request_id: input.requestId });
    // Pre-migration receipts were already placed under the former contract.
    return raw == null || requestSchema.parse(raw).state === "placed";
  },
  async cancel(input) { return await nativeRpc("cancel_public_booking_request", { p_tenant_id: input.tenantId, p_request_id: input.requestId }) === true; },
};
