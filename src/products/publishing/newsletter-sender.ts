import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { batchEmailSuppression, CLIENT_MAIL_DOMAIN, sendBatchWithReceipt, type SendBatchInput, type SendBatchResult } from "@/platform/infra/email/send";
import { sanitizeEmailHtml, htmlToPlainText } from "@/platform/infra/email/html";
import { buildUnsubscribeUrl } from "@/platform/infra/email/newsletter-unsubscribe";

const batchSchema = z.object({
  id: z.string().uuid(), issueId: z.string().uuid(), workspaceId: z.string().uuid(), tenantId: z.string(),
  subject: z.string(), body: z.string(), claimToken: z.string().uuid(), recipients: z.array(z.string().email()).max(100),
});
export type NewsletterBatch = z.infer<typeof batchSchema>;
export interface NewsletterReceipt {
  status: "accepted" | "gated" | "suppressed" | "unknown";
  detail: string;
  providerMessageIds?: string[];
}
export interface NewsletterSenderStore {
  list(): Promise<string[]>;
  claim(issueId: string): Promise<NewsletterBatch | null>;
  begin(batch: NewsletterBatch): Promise<string[] | null>;
  finish(batch: NewsletterBatch, receipt: NewsletterReceipt): Promise<void>;
}
interface Db { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
export function newsletterSenderStore(db: Db | null = getSupabase() as unknown as Db | null): NewsletterSenderStore {
  async function call(action: string, id: string | null = null, input: Record<string, unknown> = {}) {
    if (!db) throw new Error("Newsletter delivery storage is unavailable.");
    const { data, error } = await db.rpc("workspace_newsletter_sender", { p_action: action, p_id: id, p_input: input });
    if (error) throw new Error("Newsletter delivery storage could not be confirmed.");
    return data;
  }
  return {
    list: async () => z.array(z.string().uuid()).parse(await call("list")),
    claim: async id => batchSchema.nullable().parse(await call("claim", id)),
    begin: async batch => z.array(z.string().email()).max(100).nullable().parse(await call("begin", batch.id, { claimToken: batch.claimToken })),
    finish: async (batch, receipt) => { await call("finish", batch.id, { claimToken: batch.claimToken, ...receipt }); },
  };
}

/** Independent kill switch. No shared flag-name list change is needed. */
export function newsletterSenderEnabled(): boolean { return process.env.STRELVA_NEWSLETTER_SENDER_RELEASE === "1"; }
const deliveryPolicy = (tenantId: string) => ({ audience: "customer" as const, tenantId, requireClientGate: true });

/** At most ten provider batches per invocation. A claimed batch can be reclaimed
 * before begin; after begin, ambiguous/crashed sends require reconciliation,
 * never automatic re-delivery after the provider's idempotency window expires. */
export async function sendApprovedNewsletterIssues(deps: {
  store?: NewsletterSenderStore;
  enabled?: () => boolean;
  released?: (workspaceId: string) => Promise<boolean>;
  suppression?: (tenantId: string) => Promise<string | null>;
  send?: (input: SendBatchInput) => Promise<SendBatchResult>;
} = {}): Promise<{ accepted: number; gated: number; suppressed: number; unknown: number; failed: number }> {
  const summary = { accepted: 0, gated: 0, suppressed: 0, unknown: 0, failed: 0 };
  if (!(deps.enabled ?? newsletterSenderEnabled)()) return summary;
  const store = deps.store ?? newsletterSenderStore();
  let remaining = 10;
  for (const issueId of await store.list()) {
    while (remaining > 0) {
      const batch = await store.claim(issueId);
      if (!batch) break;
      remaining -= 1;
      const released = await (deps.released ?? (id => workspaceReleaseFlagEnabled("publishing", id)))(batch.workspaceId).catch(() => false);
      const suppression = released ? await (deps.suppression ?? (tenant => batchEmailSuppression(deliveryPolicy(tenant))))(batch.tenantId) : "not sent: gated";
      let receipt: NewsletterReceipt;
      if (suppression) {
        receipt = { status: "gated", detail: suppression };
      } else {
        // Validate all pre-send configuration before crossing the one-way marker.
        let messages: SendBatchInput["messages"] | null = null;
        try {
          const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/+$/, "");
          const html = sanitizeEmailHtml(batch.body);
          const text = htmlToPlainText(batch.body);
          messages = batch.recipients.map(email => {
            const unsubscribe = buildUnsubscribeUrl(origin, { tenantId: batch.tenantId, email });
            return { to: email, subject: batch.subject.replace(/<[^>]*>/g, " ").replace(/[\r\n\t]+/g, " ").trim(),
              html: `${html}<p><a href="${unsubscribe}">Unsubscribe</a></p>`, text: `${text}\n\nUnsubscribe: ${unsubscribe}`,
              headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
          });
        } catch {
          // No sending marker exists; configuration recovery may retry safely.
        }
        // begin rechecks current membership and lifecycle. After this durable
        // marker, even a transport timeout is terminal until reconciled.
        if (messages === null) {
          receipt = { status: "gated", detail: "not sent: newsletter preparation unavailable" };
        } else {
        const recipients = await store.begin(batch);
        if (recipients === null) break;
        if (!recipients.length) {
          receipt = { status: "suppressed", detail: "not sent: no active subscribers" };
        } else {
          try {
            const result = await (deps.send ?? sendBatchWithReceipt)({
              ...deliveryPolicy(batch.tenantId), fromName: "Newsletter", fromAddress: `newsletter@${CLIENT_MAIL_DOMAIN}`,
              idempotencyKey: `workspace-newsletter:${batch.id}`,
              messages: messages.filter(message => recipients.includes(message.to)),
            });
            receipt = result.status === "accepted"
              ? { status: "accepted", detail: "Provider accepted this batch; delivery is not verified.", providerMessageIds: result.providerMessageIds }
              : { status: "gated", detail: result.reason };
          } catch {
            receipt = { status: "unknown", detail: "Send outcome unconfirmed. Reconcile before retrying." };
          }
        }
        }
      }
      // Receipt retries never invoke the provider again. If both writes fail,
      // the durable sending marker still prevents an automatic duplicate.
      try {
        try { await store.finish(batch, receipt); } catch { await store.finish(batch, receipt); }
        summary[receipt.status] += 1;
      } catch { summary.failed += 1; }
    }
    if (remaining === 0) break;
  }
  return summary;
}
