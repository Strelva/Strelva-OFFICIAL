// Browser-safe public confirmation evidence; provider and database reads stay in profile.ts.
import { z } from "zod";
export const publicVerificationSchema = z.object({ domain: z.object({ verified: z.boolean(), url: z.string().nullable(), confirmedAt: z.string().nullable() }), googleBusinessProfile: z.object({ linked: z.boolean(), verified: z.boolean().nullable(), url: z.string().nullable() }), ownerConfirmedFactCount: z.number().int().nonnegative(), lastConfirmedAt: z.string().nullable(), operatingAgencies: z.array(z.object({ name: z.string() })) });
export const unknownVerification = { domain: { verified: false, url: null, confirmedAt: null }, googleBusinessProfile: { linked: false, verified: null, url: null }, ownerConfirmedFactCount: 0, lastConfirmedAt: null, operatingAgencies: [] };
export type PublicVerification = z.infer<typeof publicVerificationSchema>;
