import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { bindingEncryptionReady, googleBindingsEnabled, upsertGoogleBinding } from "@/platform/account-bindings/store";
import { recordGoogleConnection } from "@/lib/google-access";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { publishingNoticesEnabled } from "@/platform/needs-you/publishing-delivery";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";

export const GOOGLE_RECONNECT_COOKIE = "strelva_google_reconnect";
const MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";
const targetSchema = z.object({
  id: z.string().uuid(), bindingId: z.string().uuid(), workspaceId: z.string().uuid(),
  tenantId: z.string().nullable(), tenantStableId: z.string().uuid().nullable(),
  recipient: z.string().email(), openedAt: z.string(), expiresAt: z.string(),
  noticeStatus: z.enum(["not_sent", "sending", "accepted", "suppressed", "failed"]),
});
export type ReconnectTarget = z.infer<typeof targetSchema>;
export interface ReconnectDb { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> }
export function reconnectHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function secret(): string {
  const value = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value) throw new Error("Google reconnect signing is not configured.");
  return value;
}
export function signReconnectToken(target: ReconnectTarget, purpose: "link" | "state", nonce = "", now = Date.now()): string {
  const encoded = Buffer.from(JSON.stringify({ v: 1, id: target.id, workspaceId: target.workspaceId, recipient: target.recipient,
    purpose, nonce, exp: Math.min(Date.parse(target.expiresAt), now + (purpose === "state" ? 10 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000)) })).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret()).update(`google-reconnect-v1:${encoded}`).digest("base64url")}`;
}
export function verifyReconnectToken(token: string, purpose: "link" | "state", now = Date.now()): { id: string; workspaceId: string; recipient: string; nonce: string } | null {
  try {
    if (token.length > 2048) return null;
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const expected = Buffer.from(createHmac("sha256", secret()).update(`google-reconnect-v1:${encoded}`).digest("base64url"));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const parsed = z.object({ v: z.literal(1), id: z.string().uuid(), workspaceId: z.string().uuid(), recipient: z.string().email(),
      purpose: z.literal(purpose), nonce: z.string().max(128), exp: z.number().finite().gt(now) }).parse(JSON.parse(Buffer.from(encoded, "base64url").toString()));
    return { id: parsed.id, workspaceId: parsed.workspaceId, recipient: parsed.recipient, nonce: parsed.nonce };
  } catch { return null; }
}

export function reconnectStore(db: ReconnectDb | null = getSupabase() as unknown as ReconnectDb | null) {
  async function call(action: string, id: string | null = null, input: Record<string, unknown> = {}): Promise<unknown> {
    if (!db) throw new Error("Google reconnect storage is unavailable.");
    const result = await db.rpc("publishing_google_reconnect", { p_action: action, p_id: id, p_input: input });
    if (result.error) throw new Error("Google reconnect storage failed.");
    return result.data;
  }
  return {
    async list() { return z.array(z.string().uuid()).parse(await call("list")); },
    async target(action: "prepare" | "read" | "begin" | "consume" | "notice_claim", id: string, input: Record<string, unknown> = {}) {
      return targetSchema.nullable().parse(await call(action, id, input));
    },
    async notice(id: string, result: SendEmailResult) {
      await call("notice", id, { status: result.status, providerMessageId: result.status === "accepted" ? result.providerMessageId : null });
    },
    async noticeFailed(id: string) { await call("notice", id, { status: "failed" }); },
    async restored(id: string) {
      if (!z.object({ restored: z.literal(true) }).safeParse(await call("restored", id)).success) throw new Error("Google reconnect could not be confirmed.");
    },
  };
}
export type ReconnectStore = ReturnType<typeof reconnectStore>;

export async function reconnectReleaseEnabled(workspaceId: string): Promise<boolean> {
  return googleBindingsEnabled() && bindingEncryptionReady() && await workspaceReleaseFlagEnabled("publishing", workspaceId);
}
export function reconnectAppOrigin(): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || "");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Google reconnect origin is not configured.");
  return url.origin;
}
export function reconnectUrl(target: ReconnectTarget): string {
  return `${reconnectAppOrigin()}/api/publishing/google/reconnect?token=${encodeURIComponent(signReconnectToken(target, "link"))}`;
}

/** Prepare/send the outage notice through the existing transport. Provider
 * idempotency and the accepted ledger keep repeated cron runs to one notice. */
export async function chaseGoogleReconnectNotices(deps: { store?: ReconnectStore; send?: (input: SendEmailInput) => Promise<SendEmailResult>; enabled?: (target: ReconnectTarget) => Promise<boolean> } = {}): Promise<{ accepted: number; suppressed: number; failed: number }> {
  const summary = { accepted: 0, suppressed: 0, failed: 0 };
  if (!releaseFlagMayBeOn("publishing") || !googleBindingsEnabled()) return summary;
  const store = deps.store ?? reconnectStore();
  for (const bindingId of await store.list()) {
    const target = await store.target("prepare", bindingId);
    if (!target || ["accepted", "sending", "failed"].includes(target.noticeStatus)) continue;
    try {
      const enabled = deps.enabled ? await deps.enabled(target) : await publishingNoticesEnabled(target.workspaceId, target.tenantId);
      if (!enabled) { summary.suppressed += 1; continue; }
      if (!(await store.target("notice_claim", target.id))) continue;
      const result = await (deps.send ?? sendEmailWithReceipt)({
        audience: "client", ...(target.tenantId ? { tenantId: target.tenantId } : {}), to: target.recipient,
        fromAddress: "hello@updates.strelva.com", subject: "Reconnect Google to resume publishing",
        options: { heading: "Google disconnected", paragraphs: ["Your drafts and listing are still here. Strelva has stopped writing to Google. Reconnect your Google account to restore access. Older drafts need your approval again before anything posts."],
          button: { label: "Reconnect Google", url: reconnectUrl(target) } },
        idempotencyKey: `publishing-google-outage:${target.id}`, tags: { stream: "publishing", kind: "google_reconnect" },
      });
      await store.notice(target.id, result);
      summary[result.status] += 1;
    } catch {
      await store.noticeFailed(target.id);
      summary.failed += 1;
    }
  }
  return summary;
}

/** The grant alone never authorizes a Google write. This only restores the
 * existing binding and retains the selected location, rather than picking the
 * first profile from the owner's account. */
export async function finishGoogleReconnect(target: ReconnectTarget, code: string, fetcher: typeof fetch = fetch): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google reconnect is not configured.");
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code,
      grant_type: "authorization_code", redirect_uri: `${reconnectAppOrigin()}/api/publishing/google/reconnect/callback` }),
  });
  if (!response.ok) throw new Error("Google did not restore access. Request a new reconnect link.");
  const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive().max(86400), scope: z.string() }).parse(await response.json());
  const scopes = tokens.scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes(MANAGE_SCOPE)) throw new Error("Google publishing permission was not granted.");
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  if (target.tenantId) {
    const outcome = await recordGoogleConnection({ tenantId: target.tenantId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, scopes });
    if (outcome.binding !== "written") throw new Error("Google access could not be saved in this workspace.");
  } else {
    const saved = await upsertGoogleBinding({ workspaceId: target.workspaceId, originTenantStableId: target.tenantStableId,
      scopes, refreshToken: tokens.refresh_token, accessToken: tokens.access_token, tokenExpiresAt: expiresAt, status: "connected" }, "oauth");
    if (saved.id !== target.bindingId) throw new Error("Google access reached a different binding.");
  }
}

export function newReconnectNonce(): string { return randomBytes(32).toString("base64url"); }
