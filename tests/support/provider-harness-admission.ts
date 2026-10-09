import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";

const reference = z.string().trim().min(1).max(500);
const uuid = z.string().uuid();
const absolutePath = z.string().refine(isAbsolute, "Use an absolute owned proof file path");
const localOrigin = z.string().url().refine(value => {
  const url = new URL(value);
  return ["localhost", "127.0.0.1"].includes(url.hostname) && url.origin === value
    && !url.username && !url.password;
}, "The control plane must be the owned loopback proof app");
const common = z.object({ schemaVersion: z.literal(1), environment: z.literal("nonproduction"),
  authorizationReference: reference, approvedBy: reference, approvedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }), appOrigin: localOrigin,
  ownerAuthStatePath: absolutePath, workspaceId: uuid, ownerUserId: uuid, ownerEmail: z.string().email(),
});
export const homeFinderProofAdmissionSchema = common.extend({ kind: z.literal("home-finder"),
  actions: z.tuple([z.literal("read-licensed-feed"), z.literal("send-one-consented-inquiry")]),
  bindingId: uuid, externalInstallationId: reference, licenseReference: reference,
  clientUrl: z.string().url().refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }),
  clientExecutionAuthorization: reference, listingId: reference, searchQuery: z.string().max(160),
  buyer: z.object({ name: z.string().min(1).max(120), email: z.string().email(), consent: z.literal(true), consentReference: reference }).strict(),
  brokerageDeliveryAuthorization: reference, agencyDeliveryAuthorization: reference,
}).strict();
export const sandboxProofAdmissionSchema = common.extend({ kind: z.literal("sandbox-application"),
  actions: z.tuple([z.literal("build-one-candidate"), z.literal("read-native-evidence")]),
  workId: uuid, candidateVersion: z.number().int().positive(), candidateRevision: z.number().int().nonnegative(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), budgetJobId: uuid, maximumCents: z.number().int().min(1).max(1_000_000),
  teamId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), image: z.string().regex(/^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$/),
  runtimeQualificationId: uuid, policyVersion: reference, runtimePolicyReference: reference, memoryContractReference: reference, payerAcceptanceReference: reference,
  exactBillingResolverReference: reference,
}).strict();

/** Necessary run inputs, never a substitute for human permission or SQL authority.
 * The closed full-provider runner remains held even when this file is present. */
export function parseProviderProofAdmission<T>(schema: z.ZodType<T>, raw: unknown, now = Date.now()): T {
  const value = schema.parse(raw);
  const clock = common.pick({ approvedAt: true, expiresAt: true }).parse(value);
  if (Date.parse(clock.approvedAt) > now || Date.parse(clock.expiresAt) <= now || Date.parse(clock.expiresAt) <= Date.parse(clock.approvedAt))
    throw new Error("Provider proof is held: approval is expired or not current.");
  return value;
}
export function requireProviderProofAdmission<T>(kind: string, schema: z.ZodType<T>): T {
  const path = process.env.STRELVA_PROVIDER_PROOF_ADMISSION;
  if (process.env.STRELVA_AUTHORIZED_PROVIDER_PROOF !== "1" || process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || !path || !isAbsolute(path))
    throw new Error(`Provider proof held: explicit nonproduction ${kind} authorization, existing owner session and scoped admission inputs are required. A profile flag grants no authority.`);
  if (statSync(path).size > 64 * 1024) throw new Error("Provider proof admission is too large.");
  return parseProviderProofAdmission(schema, JSON.parse(readFileSync(path, "utf8")));
}
