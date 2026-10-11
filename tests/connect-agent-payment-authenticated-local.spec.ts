import { createHash } from "node:crypto";
import Stripe from "stripe";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { localSql } from "./support/journeys";
import { agentPaymentProviderAdmission, privatePaymentInput } from "./support/money-agent-provider-contracts";
import { assertProviderReporter, parseProviderProofAdmission, requireProviderProofAdmission, loadProviderOwnerState, verifyProviderWorkspaceOwner, readPrivateJson, claimProviderDispatch } from "./support/provider-harness-admission";
test.use({ trace: "off", screenshot: "off", video: "off" }); test.setTimeout(180_000); test.describe.configure({ retries: 0 });
test("one consenting test payer uses qualified SPT direct charge with exact ledger and exit denial", async ({ browser }, info) => {
 assertProviderReporter(info.config); const scope = requireProviderProofAdmission("connect-agent-payment", agentPaymentProviderAdmission);
 const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: loadProviderOwnerState(scope.ownerAuthStatePath) });
 let claim: ReturnType<typeof claimProviderDispatch> | undefined;
 try {
  await verifyProviderWorkspaceOwner(owner, scope);
  // No live-mode fallback and no synthetic payment methods/intents/tokens.
  const key = process.env.STRIPE_SECRET_KEY; if (!key?.startsWith("sk_test_")) throw new Error("Test Stripe authority required");
  const input = privatePaymentInput.parse(readPrivateJson(scope.paymentInputPath, 4096));
  const contextResponse = await owner.request.post("/api/payments/agent/context", { maxRetries: 0, maxRedirects: 0, headers: { origin: scope.appOrigin }, data: { paymentCapability: input.paymentCapability } });
  expect(contextResponse.status()).toBe(200);
  const context = z.object({ workspaceId: z.string(), amountCents: z.number(), currency: z.string(), networkId: z.string(), chargeType: z.literal("direct"), protocol: z.literal("2026-09-30.preview") }).passthrough().parse(await contextResponse.json());
  expect(context).toMatchObject({ workspaceId: scope.workspaceId, amountCents: scope.amountCents, currency: scope.currency, networkId: scope.merchantProfileId });
  expect(localSql<boolean>(`select exists(select 1 from public.connected_accounts where workspace_id=:'v1'::uuid and stripe_account_id=:'v2' and generation=:'v3'::bigint and state='ready');`, scope.workspaceId, scope.merchantAccountId, String(scope.merchantGeneration))).toBe(true);
  expect(localSql<number>(`select count(*) from public.business_payments where workspace_id=:'v1'::uuid and reference_id=:'v2';`, scope.workspaceId, scope.paymentRequestId)).toBe(0);
  parseProviderProofAdmission(agentPaymentProviderAdmission, scope);
  const capabilityHash = createHash("sha256").update(input.paymentCapability).digest("hex");
  expect(localSql<boolean>(`select exists(select 1 from public.business_payment_requests r where r.id=:'v1'::uuid and r.workspace_id=:'v2'::uuid and r.token_hash=:'v3' and r.amount_cents=:'v4'::bigint and r.currency=:'v5' and r.expires_at>clock_timestamp() and public.read_public_payment_request(r.token_hash)->>'status'='unpaid');`, scope.paymentRequestId, scope.workspaceId, capabilityHash, String(scope.amountCents), scope.currency)).toBe(true);
  await verifyProviderWorkspaceOwner(owner, scope);
  parseProviderProofAdmission(agentPaymentProviderAdmission, scope);
  claim = claimProviderDispatch(scope, scope.paymentRequestId);
  const pay = () => owner.request.post("/api/payments/agent", { maxRetries: 0, maxRedirects: 0, data: { workspaceId: scope.workspaceId, ...input } });
  const response = await pay(); expect(response.status()).toBe(200);
  const result = z.object({ status: z.literal("succeeded"), paymentId: z.string().uuid(), providerObjectId: z.string().regex(/^pi_[A-Za-z0-9]+$/) }).strict().parse(await response.json());
  claim.recordRequest(result.paymentId);
  const stripe = new Stripe(key);
  const intent = await stripe.paymentIntents.retrieve(result.providerObjectId, {}, { stripeAccount: scope.merchantAccountId });
  expect(intent.livemode).toBe(false); expect(intent.status).toBe("succeeded"); expect(intent.amount_received).toBe(scope.amountCents); expect(intent.currency).toBe(scope.currency);
  // Lack of authoritative payer identity fails qualification; possession alone is insufficient.
  expect(typeof intent.customer === "string" ? intent.customer : intent.customer?.id).toBe(scope.payerCustomerId);
  expect(intent.metadata.businessPaymentId).toBe(result.paymentId);
  expect(localSql<boolean>(`select exists(select 1 from public.business_payments p join public.business_payment_events e on e.payment_id=p.id where p.id=:'v1'::uuid and p.workspace_id=:'v2'::uuid and p.merchant_account_id=:'v3' and p.amount_cents=:'v4'::bigint and p.currency=:'v5' and p.reference_id=:'v6' and e.kind='paid' and e.provider_object_id=:'v7' and e.amount_cents=p.amount_cents);`, result.paymentId, scope.workspaceId, scope.merchantAccountId, String(scope.amountCents), scope.currency, scope.paymentRequestId, result.providerObjectId)).toBe(true);
  // Same capability is the authorized recovery, never a second intent/payment.
  parseProviderProofAdmission(agentPaymentProviderAdmission, scope);
  await verifyProviderWorkspaceOwner(owner, scope);
  parseProviderProofAdmission(agentPaymentProviderAdmission, scope);
  const replay = await pay(); expect(replay.status()).toBe(200); expect(await replay.json()).toEqual({ status: "paid", paymentId: result.paymentId });
  expect(localSql<number>(`select count(*) from public.business_payments where workspace_id=:'v1'::uuid and reference_id=:'v2';`, scope.workspaceId, scope.paymentRequestId)).toBe(1);
  const exitedInput = privatePaymentInput.parse(readPrivateJson(scope.exitedPaymentInputPath, 4096));
  expect(exitedInput.paymentCapability).not.toBe(input.paymentCapability);
  expect(localSql<boolean>(`select to_jsonb(public.workspace_exit_completed(:'v1'::uuid));`, scope.exitedWorkspaceId)).toBe(true);
  const exitHash = createHash("sha256").update(exitedInput.paymentCapability).digest("hex");
  // Otherwise valid, already reserved attempt: only completed exit closes final admission.
  expect(localSql<boolean>(`select exists(select 1 from public.business_payment_requests r join public.business_payments p on p.workspace_id=r.workspace_id and p.reference_id=r.id::text join public.connected_accounts c on c.workspace_id=r.workspace_id join public.agent_payment_reservations a on a.payment_id=p.id where r.id=:'v1'::uuid and r.workspace_id=:'v2'::uuid and r.token_hash=:'v3' and p.id=:'v4'::uuid and c.stripe_account_id=:'v5' and p.merchant_account_id=c.stripe_account_id and c.generation=:'v6'::bigint and c.state='ready' and 'merchant'=any(c.configurations) and exists(select 1 from public.agent_payment_policies policy where policy.workspace_id=r.workspace_id and policy.currency=r.currency and policy.per_payment_cents>=r.amount_cents) and r.amount_cents=p.amount_cents and r.currency=p.currency and a.amount_cents=p.amount_cents and a.currency=p.currency and r.expires_at>clock_timestamp() and public.read_public_payment_request(r.token_hash)->>'status'='unpaid' and (r.kind='quote' or exists(select 1 from public.business_bookings b where b.id=r.source_record_id and b.workspace_id=r.workspace_id and b.status='held')) and exists(select 1 from public.business_payment_channels ch where ch.payment_id=p.id and ch.channel='agent') and exists(select 1 from public.business_payment_attempts at where at.payment_id=p.id and at.started_at>clock_timestamp()-interval '23 hours') and not exists(select 1 from public.business_payment_provider_bindings bound where bound.payment_id=p.id));`, scope.exitedPaymentRequestId, scope.exitedWorkspaceId, exitHash, scope.exitedPaymentId, scope.exitedMerchantAccountId, String(scope.exitedMerchantGeneration))).toBe(true);
  expect(localSql<boolean>(`create function pg_temp.exit_admission_denied(p uuid,a text,g bigint) returns boolean language plpgsql as $body$ begin perform public.assert_agent_payment_admission(p,a,g); return false; exception when others then if sqlerrm='agent_payment_admission_denied' then return true;end if;raise;end $body$; select to_jsonb(pg_temp.exit_admission_denied(:'v1'::uuid,:'v2',:'v3'::bigint));`, scope.exitedPaymentId, scope.exitedMerchantAccountId, String(scope.exitedMerchantGeneration))).toBe(true);
  const snapshot = () => localSql<unknown>(`select jsonb_build_object('payments',(select count(*) from public.business_payments where workspace_id=:'v1'::uuid),'attempt',(select to_jsonb(a) from public.business_payment_attempts a where payment_id=:'v2'::uuid),'bindings',(select count(*) from public.business_payment_provider_bindings where payment_id=:'v2'::uuid),'events',(select count(*) from public.business_payment_events where payment_id=:'v2'::uuid));`, scope.exitedWorkspaceId, scope.exitedPaymentId);
  const before = snapshot();
  await verifyProviderWorkspaceOwner(owner, { ...scope, workspaceId: scope.exitedWorkspaceId });
  parseProviderProofAdmission(agentPaymentProviderAdmission, scope);
  const denied = await owner.request.post("/api/payments/agent", { maxRetries: 0, maxRedirects: 0, data: { workspaceId: scope.exitedWorkspaceId, ...exitedInput } });
  expect(denied.status()).toBe(409);
  expect(await denied.json()).toEqual({ error: "payment_not_confirmed", recovery: "Retry the same payment capability or ask the business to reconcile it. Do not start a second payment." });
  expect(snapshot()).toEqual(before);
 } catch { throw new Error("Agent payment provider proof held/failed; inspect private dispatch/provider/native ledger. Details withheld; never create another payment."); }
 finally { claim?.close(); await owner.close(); }
});
