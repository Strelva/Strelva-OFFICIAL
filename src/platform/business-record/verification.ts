import { z } from "zod";

/** Outside evidence must be recent. Matches the Google listing health window;
 * this is a public claim limit, not a reconnect, refresh or provider write. */
export const VERIFICATION_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const date = z.string().datetime({ offset: true });
const publicUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
export const publicVerificationEvidenceSchema = z.object({
  domains: z.array(z.object({ url: publicUrl, checkedAt: date.nullable() }).strict()).max(30),
  googleBusinessProfile: z.object({ linked: z.boolean(), checkedAt: date.nullable() }).strict(),
  ownerConfirmedFactCount: z.number().int().nonnegative(),
  lastConfirmedAt: date.nullable(),
  operatingAgency: z.object({ name: z.string().trim().min(1).max(120) }).strict().nullable(),
}).strict();
export type PublicVerificationEvidence = z.infer<typeof publicVerificationEvidenceSchema>;
export interface PublicBusinessVerification {
  domains: Array<{ url: string; verified: boolean; checkedAt: string | null; stale: boolean }>;
  googleBusinessProfile: { linked: boolean | null; verified: null; checkedAt: string | null; stale: boolean };
  ownerConfirmedFactCount: number | null;
  lastConfirmedAt: string | null;
  operatingAgency: { name: string } | null;
}

/** Whitelist aggregate public evidence. No blanket "verified business" verdict:
 * a Google OAuth link does not prove Google's profile verification. Missing or
 * malformed projections are unknown, never a fabricated zero or negative. */
export function publicBusinessVerification(raw: unknown, now = Date.now()): PublicBusinessVerification {
  const parsed = publicVerificationEvidenceSchema.safeParse(raw);
  if (!parsed.success) return {
    domains: [], googleBusinessProfile: { linked: null, verified: null, checkedAt: null, stale: true },
    ownerConfirmedFactCount: null, lastConfirmedAt: null, operatingAgency: null,
  };
  const evidence = parsed.data;
  const stale = (at: string | null) => !at || Date.parse(at) > now || now - Date.parse(at) > VERIFICATION_MAX_AGE_MS;
  return {
    domains: evidence.domains.map(domain => ({ ...domain, verified: !stale(domain.checkedAt), stale: stale(domain.checkedAt) })),
    googleBusinessProfile: { ...evidence.googleBusinessProfile, verified: null, stale: stale(evidence.googleBusinessProfile.checkedAt) },
    ownerConfirmedFactCount: evidence.ownerConfirmedFactCount,
    lastConfirmedAt: evidence.lastConfirmedAt && Date.parse(evidence.lastConfirmedAt) <= now ? evidence.lastConfirmedAt : null,
    operatingAgency: evidence.operatingAgency,
  };
}

export function verifiedProfileUrls(verification: PublicBusinessVerification): string[] {
  return [...new Set(verification.domains.filter(domain => domain.verified && !domain.stale).map(domain => domain.url))];
}
