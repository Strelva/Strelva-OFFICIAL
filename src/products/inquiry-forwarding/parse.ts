/**
 * Read one message that arrived at a forwarding address and find the end
 * customer in it. Pure: no I/O, no clock.
 *
 * Handles a hand forward from Gmail, Outlook (new and "Original Message"),
 * Apple Mail and generic clients; contact-form notifications (labeled
 * Name/Email/Message lines, or Reply-To); and auto-forwards, redirects and
 * BCCs, where the envelope is the customer's own message. Gmail's forwarding
 * confirmation is recognised so the owner can finish Gmail's check. Out of
 * office replies, bounces and Strelva's own mail are ignored.
 */
import { createHash } from "node:crypto";
import type { ForwardFormat } from "./contracts";

export interface ReceivedMessage {
  /** Provider message id (Resend email id). */
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  text: string | null;
  html: string | null;
  /** Header names in any case. */
  headers: Record<string, string>;
  messageId: string | null;
}

export type ParsedForward =
  | {
    kind: "inquiry";
    format: ForwardFormat;
    name: string;
    email: string | null;
    phone: string | null;
    message: string;
    subject: string | null;
    /** Who forwarded it, when that is not the customer. */
    forwardedBy: string | null;
    originalDate: string | null;
    /** Message-ID of the customer's message when it survived (auto-forward, BCC), else of the forward. */
    messageKey: string;
    /** Held for review: the forwarding server marked it spam, or it is list mail. */
    holdReason: "spam_header" | "bulk_mail" | null;
  }
  | { kind: "provider_confirmation"; provider: "gmail"; code: string; url: string | null; requestedBy: string | null }
  | { kind: "ignored"; reason: "auto_reply" | "bounce" | "loop" | "empty" };

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const EMAIL_ALL = new RegExp(EMAIL.source, "g");
const MAX_MESSAGE = 5000;

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value ?? "")]));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,6});/g, (_, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code: string) => String.fromCodePoint(Math.min(parseInt(code, 16), 0x10ffff)))
    .replace(/&amp;/gi, "&");
}

/** Enough HTML-to-text for forwarded mail: block ends become line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n________________________________\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t ]+\n/g, "\n");
}

export function parseAddress(raw: string | null | undefined): { name: string | null; email: string | null } {
  const cleaned = decodeEntities(String(raw ?? "")).replace(/\*/g, "").trim();
  const email = cleaned.match(EMAIL)?.[0]?.toLowerCase() ?? null;
  const name = cleaned
    .replace(/\[mailto:[^\]]*\]|\(mailto:[^)]*\)|<mailto:[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(EMAIL_ALL, "")
    .replace(/["<>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name: name || null, email };
}

const HEADER_LINE = /^\s*\*?(From|To|Cc|Subject|Date|Sent|Reply-To)\s*:\*?\s*(.*)$/i;
const GMAIL_MARKER = /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i;
const APPLE_MARKER = /^Begin forwarded message:\s*$/i;
const OUTLOOK_MARKER = /^(-{2,}\s*Original Message\s*-{2,}|_{10,})\s*$/i;
const QUOTE_INTRO = /^On .{4,200} wrote:\s*$/i;

interface ForwardBlock { format: ForwardFormat; headers: Record<string, string>; body: string }

/** The first forwarded header block (the message that was forwarded) and its body. */
export function findForwardBlock(text: string): ForwardBlock | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/^(>\s?)+/, ""));
  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index]!.match(HEADER_LINE);
    if (!first || first[1]!.toLowerCase() !== "from") continue;
    const headers: Record<string, string> = {};
    let end = index;
    while (end < lines.length) {
      const match = lines[end]!.match(HEADER_LINE);
      if (!match) break;
      const key = match[1]!.toLowerCase();
      if (!(key in headers)) headers[key] = match[2]!.trim();
      end += 1;
    }
    if (!headers.subject && !headers.date && !headers.sent) continue;
    let previous = index - 1;
    while (previous >= 0 && !lines[previous]!.trim()) previous -= 1;
    const marker = previous >= 0 ? lines[previous]!.trim() : "";
    const format: ForwardFormat = GMAIL_MARKER.test(marker) ? "gmail"
      : APPLE_MARKER.test(marker) ? "apple"
        : OUTLOOK_MARKER.test(marker) || headers.sent !== undefined ? "outlook"
          : "forward";
    const bodyLines: string[] = [];
    for (let at = end; at < lines.length; at += 1) {
      const line = lines[at]!;
      if (QUOTE_INTRO.test(line.trim()) || GMAIL_MARKER.test(line.trim()) || APPLE_MARKER.test(line.trim())) break;
      if (OUTLOOK_MARKER.test(line.trim()) && lines.slice(at + 1, at + 4).some((next) => /^\s*\*?From\s*:/i.test(next))) break;
      if (/^\s*\*?From\s*:/i.test(line) && lines.slice(at + 1, at + 6).some((next) => /^\s*\*?(Sent|Date|Subject)\s*:/i.test(next))) break;
      bodyLines.push(line);
    }
    return { format, headers, body: bodyLines.join("\n").trim() };
  }
  return null;
}

const LABELS: Array<[keyof LabeledFields, RegExp]> = [
  ["name", /^(?:full name|your name|name|first name)$/i],
  ["email", /^(?:email|e-mail|email address|your email|your e-mail)$/i],
  ["phone", /^(?:phone|phone number|telephone|tel|mobile|your phone)$/i],
  ["message", /^(?:message|your message|comments?|details|inquiry|enquiry|how can we help(?: you)?\??|project details|questions?)$/i],
];
interface LabeledFields { name?: string; email?: string; phone?: string; message?: string }

/** Contact-form notification lines: "Name: Jane", "Email: jane@…", "Message: …" (message may run on). */
export function labeledFields(text: string): LabeledFields {
  const out: LabeledFields = {};
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.match(/^\s*\*?([A-Za-z][A-Za-z -]{0,30}[A-Za-z?])\*?\s*:\s*(.*)$/);
    if (!match) continue;
    const label = LABELS.find(([, pattern]) => pattern.test(match[1]!.trim()))?.[0];
    if (!label || out[label]) continue;
    let value = match[2]!.trim();
    if (label === "message") {
      const rest: string[] = value ? [value] : [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const other = lines[next]!.match(/^\s*\*?([A-Za-z][A-Za-z -]{0,30}[A-Za-z?])\*?\s*:\s*(.*)$/);
        if (other && LABELS.some(([, pattern]) => pattern.test(other[1]!.trim()))) break;
        rest.push(lines[next]!);
      }
      value = rest.join("\n").trim();
    }
    if (value) out[label] = value;
  }
  return out;
}

const AUTOMATED_SENDER = /^(?:no-?reply|do-?not-?reply|donotreply|notifications?|notify|forms?|wordpress|mailer|alerts?|submissions?|website|web|info|bounce)[^@]*@|@(?:[a-z0-9-]+\.)*(?:wix|wixforms|squarespace|jotform|typeform|formspree|hubspot|godaddy|weebly|webflow|wufoo|cognitoforms|formstack|mailchimp|gravityforms)\.[a-z.]+$/i;

export function automatedSender(email: string | null): boolean {
  return Boolean(email && AUTOMATED_SENDER.test(email));
}

function stripSubjectPrefix(subject: string): string {
  return subject.replace(/^\s*(?:(?:fwd?|fw|tr|wg|rv|enc)\s*:\s*)+/i, "").trim();
}

function normalizeMessageId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
  return id && id.length <= 998 ? id : null;
}

function gmailConfirmation(message: ReceivedMessage, text: string): ParsedForward | null {
  const from = parseAddress(message.from).email;
  if (from !== "forwarding-noreply@google.com" || !/Gmail Forwarding Confirmation/i.test(message.subject)) return null;
  const code = message.subject.match(/\(#\s*(\d{6,12})\)/)?.[1] ?? text.match(/Confirmation code:\s*(\d{6,12})/i)?.[1];
  if (!code) return null;
  const url = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"')\]]+/)?.[0] ?? null;
  const requestedBy = message.subject.match(/Receive Mail from\s+(\S+@\S+)/i)?.[1]
    ?? text.match(/(\S+@\S+)\s+has requested to automatically forward mail/i)?.[1] ?? null;
  return { kind: "provider_confirmation", provider: "gmail", code, url: url && url.length <= 1000 ? url : null, requestedBy: requestedBy ? parseAddress(requestedBy).email : null };
}

export function parseForwardedMessage(message: ReceivedMessage, options: { inboundDomain: string | null }): ParsedForward {
  const headers = lowerHeaders(message.headers);
  const text = (message.text?.trim() ? message.text : message.html ? htmlToText(message.html) : "").replace(/\r\n?/g, "\n");
  const envelope = parseAddress(message.from);
  const confirmation = gmailConfirmation(message, text);
  if (confirmation) return confirmation;
  if (envelope.email && /^(?:mailer-daemon|postmaster)@/i.test(envelope.email)) return { kind: "ignored", reason: "bounce" };
  if (envelope.email && (envelope.email.endsWith("@strelva.com") || envelope.email.endsWith(".strelva.com") || (options.inboundDomain && envelope.email.endsWith(`@${options.inboundDomain}`)))) {
    return { kind: "ignored", reason: "loop" };
  }
  if (/^auto-replied/i.test(headers["auto-submitted"] ?? "") || headers["x-autoreply"] || headers["x-autorespond"]
    || /^(?:automatic reply|auto(?:matic)?[- ]?reply|out of (?:the )?office)\b/i.test(message.subject.trim())) {
    return { kind: "ignored", reason: "auto_reply" };
  }
  const block = findForwardBlock(text);
  let format: ForwardFormat;
  let customer: { name: string | null; email: string | null };
  let body: string;
  let subject: string | null;
  let originalDate: string | null = null;
  let forwardedBy: string | null = null;
  if (block) {
    format = block.format;
    customer = parseAddress(block.headers.from);
    body = block.body;
    subject = block.headers.subject ? stripSubjectPrefix(block.headers.subject) : stripSubjectPrefix(message.subject);
    originalDate = block.headers.date ?? block.headers.sent ?? null;
    forwardedBy = envelope.email && envelope.email !== customer.email ? envelope.email : null;
    const innerReplyTo = parseAddress(block.headers["reply-to"]);
    if (innerReplyTo.email && automatedSender(customer.email)) customer = innerReplyTo;
  } else {
    format = "direct";
    customer = envelope;
    body = text.trim();
    subject = stripSubjectPrefix(message.subject) || null;
    const replyTo = message.replyTo.map((value) => parseAddress(value)).find((value) => value.email && value.email !== envelope.email);
    if (replyTo?.email && automatedSender(envelope.email)) {
      customer = { name: replyTo.name, email: replyTo.email };
      format = "form";
    }
  }
  const labeled = labeledFields(body);
  const labeledEmail = labeled.email ? parseAddress(labeled.email).email : null;
  if (labeledEmail && (!customer.email || automatedSender(customer.email) || format === "form")) {
    customer = { name: labeled.name ?? (customer.email === labeledEmail ? customer.name : null), email: labeledEmail };
    format = "form";
  } else if (labeled.name && format === "form" && !customer.name) {
    customer = { ...customer, name: labeled.name };
  }
  const messageText = (format === "form" && labeled.message ? labeled.message : body).slice(0, MAX_MESSAGE).trim();
  if (!customer.email && !messageText) return { kind: "ignored", reason: "empty" };
  const name = (customer.name ?? labeled.name ?? customer.email ?? "Someone who emailed").slice(0, 200);
  const spamFlag = /^yes/i.test(headers["x-spam-flag"] ?? "") || /^yes/i.test(headers["x-spam-status"] ?? "");
  const bulk = !block && (Boolean(headers["list-unsubscribe"] || headers["list-id"]) || /^(?:bulk|list|junk)$/i.test((headers.precedence ?? "").trim()));
  const messageKey = normalizeMessageId(headers["message-id"]) ?? normalizeMessageId(message.messageId)
    ?? `content:${createHash("sha256").update(JSON.stringify([customer.email, subject, originalDate, messageText])).digest("hex")}`;
  return {
    kind: "inquiry",
    format,
    name,
    email: customer.email,
    phone: labeled.phone?.slice(0, 60) ?? null,
    message: messageText,
    subject: subject ? subject.slice(0, 300) : null,
    forwardedBy,
    originalDate: originalDate ? originalDate.slice(0, 120) : null,
    messageKey,
    holdReason: spamFlag ? "spam_header" : bulk ? "bulk_mail" : null,
  };
}

/** The per-business dedupe key: one row per message, whichever address it came through. */
export function forwardedLeadId(messageKey: string): string {
  return `lead_fwd_${createHash("sha256").update(messageKey).digest("hex").slice(0, 40)}`;
}

/** Same sender, same words: one inquiry even when it is forwarded twice in a day. */
export function forwardedSubmissionHash(email: string | null, message: string): string {
  const words = message.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 2000);
  return createHash("sha256").update(JSON.stringify([email ?? "", words])).digest("hex").slice(0, 16);
}
