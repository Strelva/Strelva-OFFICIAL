import { readBookingContext } from "./store";

/**
 * The business's own phone, from the booking record it keeps, for the
 * tap-to-call link in a visitor page's header and its bad-news sentences.
 * Presentation only: a missing or failed read is no phone, never an error.
 */
export async function readVisitorBusinessPhone(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const phone = (await readBookingContext(tenantId))?.phone?.trim();
    return phone ? phone : null;
  } catch {
    return null;
  }
}
