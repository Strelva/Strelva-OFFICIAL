import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { logger } from "@/platform/infra/logger";
import { validateUrlSafety } from "@/platform/infra/public-url-safety";
import { isSafeFetchUrl } from "@/platform/infra/safe-fetch";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import type { AppEvent, AppEventType } from "./contracts";
import { postPinned } from "./transport";

export interface WebhookTarget { id: string; workspaceId: string; url: string; eventTypes: AppEventType[]; secretCiphertext: string }
export type WebhookOutcome = "delivered" | "retry" | "permanent" | "gone";

const UNSAFE_ADDRESS = "This address can't receive events. Use a public https address.";

/** A new signing secret. Shown once; only a sealed copy and its last four characters are kept. */
export function newWebhookSecret(): { secret: string; hint: string } {
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  return { secret, hint: secret.slice(-4) };
}

const hmacHex = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest("hex");

/** `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">` */
export function signAppEventWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

/** For the maker's side (and our tests): constant-time compare, with a freshness window. */
export function verifyAppEventSignature(secret: string, header: string, body: string, nowSeconds: number, toleranceSeconds = 300): boolean {
  const parts = new Map(header.split(",").map((part) => {
    const at = part.indexOf("=");
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
  }));
  const timestamp = Number(parts.get("t"));
  const given = parts.get("v1");
  if (!Number.isInteger(timestamp) || !given || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(hmacHex(secret, `${timestamp}.${body}`), "hex");
  const actual = /^[0-9a-f]{64}$/.test(given) ? Buffer.from(given, "hex") : null;
  return Boolean(actual) && actual!.length === expected.length && timingSafeEqual(actual!, expected);
}

/** What is sent: ids, kinds, times and states. The same thin event a coding agent reads. */
export function webhookBody(event: AppEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    schemaVersion: event.schemaVersion,
    businessId: event.workspaceId,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    data: event.data,
  });
}

/** Trim, parse, https only, no credentials, port 443, a public address. Returns the normalized address. */
export async function validateWebhookUrl(url: string, validate: (url: string) => Promise<unknown> = validateUrlSafety): Promise<string> {
  const text = url.trim();
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new WorkspaceConflictError(UNSAFE_ADDRESS); }
  if (text.length > 500 || parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port !== "" && parsed.port !== "443") || !isSafeFetchUrl(text)) {
    throw new WorkspaceConflictError(UNSAFE_ADDRESS);
  }
  try { await validate(parsed.href); } catch { throw new WorkspaceConflictError(UNSAFE_ADDRESS); }
  if (parsed.href.length > 500) throw new WorkspaceConflictError(UNSAFE_ADDRESS);
  return parsed.href;
}

/**
 * One signed delivery. 2xx delivered; 410 gone; other 3xx permanent (redirects are never followed);
 * 408, 429 and 5xx retry; other 4xx permanent. Never logs the secret, the body or the full address.
 */
export async function sendAppEventWebhook(
  target: WebhookTarget,
  event: AppEvent,
  attempt: number,
  deps: { post?: typeof postPinned; decrypt?: (value: string) => string; now?: () => number } = {},
): Promise<WebhookOutcome> {
  const host = (() => { try { return new URL(target.url).hostname; } catch { return "unknown"; } })();
  try {
    const secret = (deps.decrypt ?? decryptSecret)(target.secretCiphertext);
    const body = webhookBody(event);
    const timestamp = Math.floor((deps.now ?? Date.now)() / 1000);
    const { status } = await (deps.post ?? postPinned)(target.url, body, {
      "Content-Type": "application/json",
      "User-Agent": "Strelva-Events/1",
      "Strelva-Event-Id": event.id,
      "Strelva-Event-Type": event.type,
      "Strelva-Delivery-Attempt": String(attempt),
      "Strelva-Signature": signAppEventWebhook(secret, timestamp, body),
    }, { timeoutMs: 5000 });
    if (status >= 200 && status < 300) return "delivered";
    if (status === 410) return "gone";
    if (status >= 300 && status < 400) return "permanent";
    if (status === 408 || status === 429 || status >= 500) return "retry";
    return status >= 400 && status < 500 ? "permanent" : "retry";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "address not allowed") {
      logger.warn("[app-events] Webhook address not allowed", { host });
      return "permanent";
    }
    logger.warn("[app-events] Webhook delivery failed", { host, reason: message === "timed out" ? "timed out" : "request failed" });
    return "retry";
  }
}
