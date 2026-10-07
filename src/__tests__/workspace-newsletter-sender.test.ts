import { verifyUnsubscribeToken } from "@/platform/infra/email/newsletter-unsubscribe";
import type { SendBatchInput } from "@/platform/infra/email/send";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendApprovedNewsletterIssues, newsletterSenderEnabled, newsletterSenderStore, type NewsletterBatch, type NewsletterSenderStore } from "@/products/publishing/newsletter-sender";
const batch: NewsletterBatch = { id: "cc000000-0000-4000-8000-000000000001", issueId: "cc000000-0000-4000-8000-000000000002", workspaceId: "cc000000-0000-4000-8000-000000000003", tenantId: "fixture", subject: "Approved <b>issue</b>\n", body: '<p>Approved words</p><script>bad()</script>', claimToken: "cc000000-0000-4000-8000-000000000004", recipients: ["a@example.test", "b@example.test"] };
function fixture() {
  let available = true;
  const store = { list: vi.fn(async () => [batch.issueId]), claim: vi.fn(async () => { if (!available) return null; available = false; return batch; }), begin: vi.fn(async () => ["a@example.test"]), finish: vi.fn(async () => {}) } satisfies NewsletterSenderStore;
  const send = vi.fn(async (_input: SendBatchInput) => ({ status: "accepted" as const, count: 1, providerMessageIds: ["provider-1"], acceptedAt: "2026-10-07T00:00:00Z" }));
  return { store, send, enabled: () => true, released: async () => true, suppression: async () => null };
}
beforeEach(() => { vi.stubEnv("APPROVE_LINK_SECRET", "local-test-secret"); });
afterEach(() => vi.unstubAllEnvs());
it("defaults off and does not claim anything while disabled", async () => {
  vi.stubEnv("STRELVA_NEWSLETTER_SENDER_RELEASE", ""); expect(newsletterSenderEnabled()).toBe(false);
  const f = fixture(); await sendApprovedNewsletterIssues({ ...f, enabled: newsletterSenderEnabled }); expect(f.store.list).not.toHaveBeenCalled();
});
it("sends the approved snapshot to current active recipients, writes receipt, and never resends on retry", async () => {
  const f = fixture(); expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ accepted: 1 });
  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "customer", requireClientGate: true, tenantId: "fixture", fromAddress: "newsletter@mail.strelva.com", idempotencyKey: `workspace-newsletter:${batch.id}` }));
  const messages = f.send.mock.calls[0]![0].messages;
  expect(messages).toHaveLength(1); expect(messages[0]!.to).toBe("a@example.test");
  expect(messages[0]!.subject).toBe("Approved  issue"); expect(messages[0]!.html).not.toContain("script");
  expect(messages[0]!.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  expect(f.store.finish).toHaveBeenCalledWith(batch, expect.objectContaining({ status: "accepted", providerMessageIds: ["provider-1"] }));
  await sendApprovedNewsletterIssues(f); expect(f.send).toHaveBeenCalledTimes(1);
});
it("preserves stored mixed-case subscriber identity in unsubscribe tokens", async () => {
  const f = fixture(); const mixed = { ...batch, recipients: ["MixedCase@example.test"] };
  f.store.claim.mockResolvedValueOnce(mixed); f.store.begin.mockResolvedValueOnce(mixed.recipients);
  await sendApprovedNewsletterIssues(f);
  const message = f.send.mock.calls[0]![0].messages[0]!;
  const token = new URL(message.headers!["List-Unsubscribe"].slice(1, -1)).searchParams.get("token")!;
  expect(verifyUnsubscribeToken(token)).toEqual({ tenantId: "fixture", email: "MixedCase@example.test" });
});
it("writes not sent: gated even without unsubscribe secrets, and never begins a send", async () => {
  vi.stubEnv("APPROVE_LINK_SECRET", ""); const f = fixture();
  expect(await sendApprovedNewsletterIssues({ ...f, suppression: async () => "not sent: gated" })).toMatchObject({ gated: 1 });
  expect(f.store.finish).toHaveBeenCalledWith(batch, { status: "gated", detail: "not sent: gated" });
  expect(f.store.begin).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
});
it("keeps missing provider configuration retryable", async () => {
  const f = fixture(); await sendApprovedNewsletterIssues({ ...f, suppression: async () => "not sent: unconfigured" });
  expect(f.store.finish).toHaveBeenCalledWith(batch, { status: "gated", detail: "not sent: unconfigured" });
  expect(f.store.begin).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
});
it("records missing unsubscribe configuration before crossing the sending marker", async () => {
  vi.stubEnv("APPROVE_LINK_SECRET", ""); vi.stubEnv("OAUTH_STATE_SECRET", ""); vi.stubEnv("INTERNAL_API_SECRET", "");
  const f = fixture(); expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ gated: 1 });
  expect(f.store.finish).toHaveBeenCalledWith(batch, { status: "gated", detail: "not sent: newsletter preparation unavailable" });
  expect(f.store.begin).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
});
it("fails closed when the business publishing release is off or unreadable", async () => {
  const f = fixture(); await sendApprovedNewsletterIssues({ ...f, released: async () => { throw new Error("unavailable"); } });
  expect(f.store.finish).toHaveBeenCalledWith(batch, { status: "gated", detail: "not sent: gated" }); expect(f.send).not.toHaveBeenCalled();
});
it("records suppression when every snapshotted subscriber has opted out", async () => {
  const f = fixture(); f.store.begin.mockResolvedValue([]);
  expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ suppressed: 1 }); expect(f.send).not.toHaveBeenCalled();
  expect(f.store.finish).toHaveBeenCalledWith(batch, { status: "suppressed", detail: "not sent: no active subscribers" });
});
it("records a gate flipped at the transport boundary", async () => {
  const f = fixture(); const send = vi.fn(async () => ({ status: "suppressed" as const, reason: "not sent: gated" }));
  expect(await sendApprovedNewsletterIssues({ ...f, send })).toMatchObject({ gated: 1 });
});
it("holds ambiguous sends instead of retrying the provider", async () => {
  const f = fixture(); f.send.mockRejectedValue(new Error("timeout"));
  expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ unknown: 1 });
  await sendApprovedNewsletterIssues(f); expect(f.send).toHaveBeenCalledTimes(1);
  expect(f.store.finish).toHaveBeenCalledWith(batch, expect.objectContaining({ status: "unknown" }));
});
it("retries receipt persistence without retrying an accepted send", async () => {
  const f = fixture(); f.store.finish.mockRejectedValueOnce(new Error("database timeout"));
  expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ accepted: 1 });
  expect(f.store.finish).toHaveBeenCalledTimes(2); expect(f.send).toHaveBeenCalledTimes(1);
});
it("surfaces a receipt outage while the sending marker prevents duplicate sends", async () => {
  const f = fixture(); f.store.finish.mockRejectedValue(new Error("outage"));
  expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ failed: 1 });
  await sendApprovedNewsletterIssues(f); expect(f.send).toHaveBeenCalledTimes(1);
});
it("bounds each cron to ten batches", async () => {
  const f = fixture(); f.store.claim.mockResolvedValue(batch);
  expect(await sendApprovedNewsletterIssues(f)).toMatchObject({ accepted: 10 }); expect(f.send).toHaveBeenCalledTimes(10);
});
it("rejects failed or malformed storage results before sending", async () => {
  const store = newsletterSenderStore({ rpc: async () => ({ data: null, error: { message: "failed" } }) });
  await expect(store.list()).rejects.toThrow("could not be confirmed");
  await expect(newsletterSenderStore({ rpc: async () => ({ data: {}, error: null }) }).claim(batch.issueId)).rejects.toThrow();
});
