/**
 * Scaffold form handling — the self-contained Formspree replacement.
 *
 * Pure helpers behind `form-route.template.ts`: they turn an arbitrary form
 * payload into a clean, owner-facing notification email (HTML + text) that
 * states WHICH site, WHICH form, and EVERY field submitted — so the client
 * reading their inbox knows exactly what came in and can just hit reply.
 *
 * Self-contained on purpose: no external deps, no platform tenant required.
 * A Studio site with no dashboard drops these two files in and forms work.
 * (For a full Strelva tenant that wants leads in the dashboard "Who reached
 * out", use `ScaffoldLeadForm.tsx` → `/api/v1/leads/{tenant}` instead — that
 * is the platform-integrated path; this is the standalone email path.)
 *
 * Sends from the shared `mail.strelva.com` domain with a per-site from-name,
 * so no client ever needs their own verified sending domain.
 */

/** Keys the handler treats as control/meta, never rendered as a form field. */
const CONTROL_KEYS = new Set(["website", "formname", "_t", "_dwellms"]);

/** Per-value + per-form caps so a bad/abusive payload can't blow up an email. */
export const FIELD_VALUE_MAX = 5000;
export const MAX_FIELDS = 40;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Title-case a raw field key ("phoneNumber" / "phone_number" → "Phone Number"). */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface NormalizedSubmission {
  /** Ordered [label, value] pairs, control keys stripped, values capped. */
  fields: Array<[string, string]>;
  /** The submitter's email if present (used for Reply-To + shown first). */
  replyTo?: string;
}

/**
 * Pull the renderable fields out of a raw JSON body. Coerces scalars to
 * strings, drops control keys, caps count + length, preserves submit order.
 * `email` (any casing) is surfaced as `replyTo` AND kept as a visible field.
 */
export function normalizeSubmission(body: Record<string, unknown>): NormalizedSubmission {
  const fields: Array<[string, string]> = [];
  let replyTo: string | undefined;

  for (const [key, raw] of Object.entries(body)) {
    if (fields.length >= MAX_FIELDS) break;
    if (CONTROL_KEYS.has(key.toLowerCase())) continue;
    if (raw === null || raw === undefined || raw === "") continue;

    const value =
      typeof raw === "string"
        ? raw
        : typeof raw === "boolean"
          ? raw ? "Yes" : "No"
          : typeof raw === "number"
            ? String(raw)
            : Array.isArray(raw)
              ? raw.map((v) => String(v)).join(", ")
              : JSON.stringify(raw);

    const capped = value.slice(0, FIELD_VALUE_MAX);
    if (key.toLowerCase() === "email" && !replyTo && isEmail(capped)) replyTo = capped;
    fields.push([humanizeKey(key), capped]);
  }

  return { fields, replyTo };
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export interface FormEmailMeta {
  /** The site the form lives on, e.g. "McLear's Cottage". */
  siteName: string;
  /** Which form/surface, e.g. "Contact", "Booking Inquiry", "Quote Request". */
  formName: string;
  /** Human-readable submit time. */
  submittedAt: string;
}

const C = {
  ink: "#14181c",
  muted: "#565d64",
  faint: "#9aa1a8",
  hairline: "#e6e7e9",
  page: "#f3f4f5",
  card: "#ffffff",
  accent: "#447a4f", // Strelva ink sage
  panel: "#f7f8f8",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
} as const;

/** Owner-facing notification email. Clean + neutral (it is an internal notice,
 * not a customer-facing brand email), leads with site + form so it is
 * unmistakable in a busy inbox, and lists every field submitted. */
export function renderFormEmailHtml(meta: FormEmailMeta, fields: Array<[string, string]>): string {
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;vertical-align:top;width:34%;color:${C.faint};font-size:13px;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;vertical-align:top;color:${C.ink};font-size:14px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(value)}</td></tr>`,
    )
    .join(`<tr><td colspan="2" style="border-top:1px solid ${C.hairline};font-size:0;line-height:0;">&nbsp;</td></tr>`);

  return `<!doctype html><html><body style="margin:0;background:${C.page};font-family:${C.font};">
  <div style="display:none;max-height:0;overflow:hidden;">New ${escapeHtml(meta.formName)} submission from your ${escapeHtml(meta.siteName)} website.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.hairline};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:20px 28px;border-bottom:1px solid ${C.hairline};">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.faint};">${escapeHtml(meta.siteName)}</p>
        <p style="margin:4px 0 0;font-size:19px;font-weight:600;color:${C.ink};">New ${escapeHtml(meta.formName)} submission</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid ${C.hairline};background:${C.panel};">
        <p style="margin:0;font-size:12px;color:${C.faint};">Submitted ${escapeHtml(meta.submittedAt)} &middot; sent by your ${escapeHtml(meta.siteName)} site, delivered by <span style="color:${C.accent};">Strelva</span>. Reply to reach them directly.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function renderFormEmailText(meta: FormEmailMeta, fields: Array<[string, string]>): string {
  const lines = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  return (
    `${meta.siteName} — New ${meta.formName} submission\n` +
    `${"-".repeat(40)}\n` +
    `${lines}\n\n` +
    `Submitted ${meta.submittedAt}. Sent by your ${meta.siteName} site, delivered by Strelva. Reply to reach them directly.`
  );
}

/** Best-effort in-memory rate limit (per serverless instance). Honeypot +
 * dwell are the real spam defenses; this just caps burst abuse. Returns true
 * when the request is allowed. */
const hits = new Map<string, number[]>();
export function rateLimitOk(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
