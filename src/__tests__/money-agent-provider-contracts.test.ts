import { expect, it } from "vitest";
import { assistantProviderAdmission, agentPaymentProviderAdmission, planningProviderAdmission, privatePaymentInput } from "../../tests/support/money-agent-provider-contracts";
const base = { schemaVersion: 1, environment: "nonproduction", authorizationReference: "explicit-human-reference", approvedBy: "owner", approvedAt: "2026-10-08T00:00:00Z", expiresAt: "2026-10-09T00:00:00Z", appOrigin: "http://localhost:1234", ownerAuthStatePath: "/private/session.json", dispatchJournalDirectory: "/private/claims", workspaceId: "11111111-1111-4111-8111-111111111111", ownerUserId: "22222222-2222-4222-8222-222222222222", ownerEmail: "owner@example.test" };
it("assistant scope refuses inquiry/price authority and production control planes", () => {
 const a = { ...base, kind: "assistant-oauth", actions: ["approve-one-provider-connection", "observe-provider-renewal", "revoke-that-connection"], providerOrigin: "https://assistant.example.test", providerSessionPath: "/private/provider.json", authorizationUrlPath: "/private/authorization.json", clientId: "https://assistant.example.test/client.json", clientName: "Assistant", businessName: "Fictional", scopes: ["business:read"], providerAccountAuthorization: "human", callbackQualificationReference: "qualified" };
 expect(assistantProviderAdmission.safeParse(a).success).toBe(true);
 expect(assistantProviderAdmission.safeParse({ ...a, scopes: ["quotes:approve"] }).success).toBe(false);
 expect(assistantProviderAdmission.safeParse({ ...a, appOrigin: "https://live.example.test" }).success).toBe(false);
});
it("payment cannot admit missing consenting-payer and liability qualification", () => {
 const p = { ...base, kind: "connect-agent-payment", actions: ["charge-one-consented-test-payment", "read-provider-ledger", "retry-same-payment", "check-pre-exited-denial"], paymentInputPath: "/private/payment.json", paymentRequestId: base.workspaceId, merchantAccountId: "acct_test", merchantGeneration: 1, merchantProfileId: "profile_test", amountCents: 100, currency: "usd", payerCustomerId: "cus_test", payerConsentReference: "consent", payerIdentityQualificationReference: "identity", connectedAccountAuthorization: "account", liabilityAcceptanceReference: "liability", protocolQualificationReference: "SPT", exitedWorkspaceId: base.ownerUserId, exitedPaymentRequestId: base.ownerUserId, exitedPaymentId: base.ownerUserId, exitedMerchantAccountId: "acct_exit", exitedMerchantGeneration: 1, exitedPaymentInputPath: "/private/exited.json" };
 expect(agentPaymentProviderAdmission.safeParse(p).success).toBe(true);
 for (const field of ["payerConsentReference", "payerIdentityQualificationReference", "liabilityAcceptanceReference", "protocolQualificationReference"]) expect(agentPaymentProviderAdmission.safeParse({ ...p, [field]: undefined }).success).toBe(false);
 expect(agentPaymentProviderAdmission.safeParse({ ...p, exitedWorkspaceId: p.workspaceId }).success).toBe(false);
 expect(privatePaymentInput.safeParse({ paymentCapability: "a".repeat(64), sharedPaymentToken: "spt_actual", amount: 1 }).success).toBe(false);
});
it("planning cannot admit a zero-dollar unfunded or unbound intent", () => {
 const p = { ...base, kind: "native-planning-provider", actions: ["generate-one-plan", "accept-one-native-output", "read-exact-billing"], intent: "Prepare a document", originalIntentDigest: "a".repeat(64), jobId: base.workspaceId, executionKey: "provider-proof:one", maximumCents: 100, approvedModelLabels: ["google/gemini-2.5-flash"], billingProvider: "google.generative-ai", outputOperationId: "create_document", payerAcceptanceReference: "accepted", providerBillingQualificationReference: "trusted" };
 expect(planningProviderAdmission.safeParse(p).success).toBe(true);
 expect(planningProviderAdmission.safeParse({ ...p, maximumCents: 0 }).success).toBe(false);
 expect(planningProviderAdmission.safeParse({ ...p, outputOperationId: "arbitrary.execute" }).success).toBe(false);
});
