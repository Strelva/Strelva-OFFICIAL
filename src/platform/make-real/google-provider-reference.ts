import { z } from "zod";
export const nativeGoogleGrantPinSchema = z.object({ bindingId: z.string().uuid(), accountId: z.string().regex(/^accounts\/[A-Za-z0-9_-]{1,64}$/), grantGeneration: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
/** Reference metadata only: provider content stays in its expiring payload store. */
export const googleMakeRealRequestSchema = z.object({ tenantId: z.string().min(1).max(200), locationId: z.string().min(1).max(64), eventId: z.string().min(1).max(200), draftDigest: z.string().regex(/^[a-f0-9]{64}$/), nativeGrant: nativeGoogleGrantPinSchema.optional() }).strict();
export const googleProviderReferenceSchema = z.object({ businessId: z.string().uuid(), request: googleMakeRealRequestSchema, receiptId: z.string().uuid().nullable() }).strict();
export const GOOGLE_PROVIDER_REFERENCE_MAX_LENGTH = 4096;
/** Keep the old bound for every opaque/other-channel reference. The exception
 * admits only the historical Google JSON shape, never arbitrary provider data.
 * Worst canonical JSON escaping of all bounded fields remains below 4096. */
export const activationProviderReferenceSchema = z.string().max(GOOGLE_PROVIDER_REFERENCE_MAX_LENGTH).refine(value => {
  if (value.length <= 240) return true;
  try { const parsed = googleProviderReferenceSchema.safeParse(JSON.parse(value)); return parsed.success && JSON.stringify(parsed.data) === value; }
  catch { return false; }
}, "Provider reference exceeds its channel's bounded metadata contract.");

/** Parse alone cannot authorize a long reference for another channel or plan. */
export function assertExtendedProviderReference(reference: string, businessId: string, effect: { channel?: string; request: Record<string, unknown> } | undefined): void {
  activationProviderReferenceSchema.parse(reference);
  if (reference.length <= 240) return;
  const parsed = googleProviderReferenceSchema.parse(JSON.parse(reference));
  if (effect?.channel !== "google_listing" || parsed.businessId !== businessId) throw new Error("Provider reference does not belong to this declared Google effect.");
  const expected = googleMakeRealRequestSchema.parse(effect.request);
  if (JSON.stringify(expected) !== JSON.stringify(parsed.request)) throw new Error("Provider reference does not match the exact approved Google request.");
}
