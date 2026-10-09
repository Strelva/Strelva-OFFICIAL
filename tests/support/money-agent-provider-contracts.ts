import { isAbsolute } from "node:path";
import { z } from "zod";
const ref = z.string().trim().min(1).max(500);
const uuid = z.string().uuid();
const path = z.string().refine(isAbsolute);
const origin = z.string().url().refine(value => { const u = new URL(value); return ["localhost", "127.0.0.1"].includes(u.hostname) && u.origin === value && !u.username && !u.password; });
// Matches the shared admission envelope without modifying its ownership.
const common = z.object({ schemaVersion: z.literal(1), environment: z.literal("nonproduction"), authorizationReference: ref,
  approvedBy: ref, approvedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  appOrigin: origin, ownerAuthStatePath: path, dispatchJournalDirectory: path, workspaceId: uuid, ownerUserId: uuid, ownerEmail: z.string().email() });
export const assistantProviderAdmission = common.extend({ kind: z.literal("assistant-oauth"),
  actions: z.tuple([z.literal("approve-one-provider-connection"), z.literal("observe-provider-renewal"), z.literal("revoke-that-connection")]),
  providerOrigin: z.string().url().refine(v => { const u = new URL(v); return u.protocol === "https:" && u.origin === v && !u.username && !u.password; }),
  providerSessionPath: path, authorizationUrlPath: path, clientId: z.string().url(), clientName: ref, businessName: ref,
  scopes: z.array(z.enum(["business:read", "website:read", "website:propose"])).min(1),
  providerAccountAuthorization: ref, callbackQualificationReference: ref,
}).strict();
export const agentPaymentProviderAdmission = common.extend({ kind: z.literal("connect-agent-payment"),
  actions: z.tuple([z.literal("charge-one-consented-test-payment"), z.literal("read-provider-ledger"), z.literal("retry-same-payment"), z.literal("check-pre-exited-denial")]),
  paymentInputPath: path, paymentRequestId: uuid, merchantAccountId: z.string().regex(/^acct_[A-Za-z0-9]+$/), merchantGeneration: z.number().int().nonnegative(),
  merchantProfileId: z.string().regex(/^profile_[A-Za-z0-9]+$/), amountCents: z.number().int().positive().max(1000000), currency: z.literal("usd"),
  payerCustomerId: z.string().regex(/^cus_[A-Za-z0-9]+$/), payerConsentReference: ref, payerIdentityQualificationReference: ref, connectedAccountAuthorization: ref, liabilityAcceptanceReference: ref,
  protocolQualificationReference: ref, exitedWorkspaceId: uuid, exitedPaymentRequestId: uuid, exitedPaymentId: uuid, exitedMerchantAccountId: z.string().regex(/^acct_[A-Za-z0-9]+$/), exitedMerchantGeneration: z.number().int().nonnegative(), exitedPaymentInputPath: path,
}).strict().refine(v => v.exitedWorkspaceId !== v.workspaceId);
export const planningProviderAdmission = common.extend({ kind: z.literal("native-planning-provider"),
  actions: z.tuple([z.literal("generate-one-plan"), z.literal("accept-one-native-output"), z.literal("read-exact-billing")]),
  intent: z.string().trim().min(1).max(3000), originalIntentDigest: z.string().regex(/^[a-f0-9]{64}$/), jobId: uuid,
  executionKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/), maximumCents: z.number().int().positive().max(1000000),
  approvedModelLabels: z.array(z.string().regex(/^(google|anthropic|openai)\/[A-Za-z0-9_.:-]+$/)).min(1).max(2), billingProvider: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(96),
  outputOperationId: z.enum(["create_document", "create_tracker"]), payerAcceptanceReference: ref, providerBillingQualificationReference: ref,
}).strict();
export const privatePaymentInput = z.object({ paymentCapability: z.string().regex(/^[a-f0-9]{64}$/), sharedPaymentToken: z.string().regex(/^spt_[A-Za-z0-9]+$/) }).strict();
