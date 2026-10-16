/**
 * Visitor mail (xs-visitor, October 16, 2026): what a business's own customers
 * receive, in the XA look. The business is the sender and the name at the top;
 * Strelva appears only as the quiet "Runs on Strelva" credit underneath.
 *
 * PRESENTATION ONLY. Nothing here sends, signs a link or reads a business.
 * Sending stays on the one path (`send.ts`, gated by `enabled.ts`), and client
 * email stays off during the rollout. Callers pass URLs that existing issuance
 * already authorized.
 *
 * `visitorMailFromOptions` renders any customer-audience `EmailOptions` (the
 * options carry `businessName`) without changing those options, so inquiry
 * message digests and stored review bodies stay byte-identical. Builders below
 * give booking mail its one dominant element: the time.
 */
import { BRAND_CREDIT } from "@/platform/infra/agency-brand";
import type { EmailOptions } from "./layout";
import type { XaMail, XaMailAction, XaMailBlock } from "./xa-mail";

const CREDIT = BRAND_CREDIT.replace(/\.$/, "");

function footer(business: string | undefined, note?: string): string {
  const said = note?.trim();
  return [said, business?.trim() && !said?.includes(business.trim()) ? business.trim() : "", CREDIT].filter(Boolean).join(" · ");
}

function footerLinks(opts: Pick<EmailOptions, "manageUrl" | "unsubscribeUrl">): XaMailAction[] {
  return [
    ...(opts.manageUrl ? [{ label: "Manage", url: opts.manageUrl }] : []),
    ...(opts.unsubscribeUrl ? [{ label: "Unsubscribe", url: opts.unsubscribeUrl }] : []),
  ];
}

/** Any customer email, block for block. Nothing in `opts` is dropped or reworded. */
export function visitorMailFromOptions(opts: EmailOptions): XaMail {
  const business = opts.businessName?.trim() || opts.brand?.name || "";
  const [lede, ...rest] = opts.paragraphs ?? [];
  const blocks: XaMailBlock[] = [
    ...(business ? [{ kind: "identity" as const, business }] : []),
    { kind: "headline", text: opts.heading, ...(lede ? { lede } : {}) },
    ...rest.map(text => ({ kind: "sentence" as const, text })),
    ...(opts.highlight ? [{ kind: "figure" as const, value: opts.highlight.value, label: opts.highlight.label, ...(opts.highlight.note ? { detail: opts.highlight.note } : {}) }] : []),
    ...(opts.bullets?.length ? [{ kind: "rows" as const, rows: opts.bullets.map(b => ({ label: b.title, value: b.text ?? "" })) }] : []),
    ...(opts.decisions ?? []).flatMap((d): XaMailBlock[] => [
      { kind: "sentence", text: [d.title, d.detail, d.note].filter(Boolean).join(" ") },
      ...(d.approve ? [{ kind: "primary" as const, action: d.approve }] : []),
      { kind: "link", action: d.open },
    ]),
    // The visitor's own words come back as a quote, not as a table cell.
    ...(opts.rows ?? []).filter(row => row.label === "Your message").map(row => ({ kind: "quote" as const, label: row.label, text: row.value })),
    ...(opts.rows?.some(row => row.label !== "Your message") ? [{ kind: "rows" as const, rows: opts.rows.filter(row => row.label !== "Your message") }] : []),
    // Suggested times: each its own link in one hairline list, never label/value rows.
    ...(opts.choices?.items.length ? [{ kind: "choices" as const, label: opts.choices.label ?? "", items: opts.choices.items }] : []),
    ...(opts.button ? [{ kind: "primary" as const, action: opts.button }] : []),
    ...(opts.secondaryButton ? [{ kind: "link" as const, action: opts.secondaryButton }] : []),
  ];
  return { subject: opts.heading, ...(opts.preheader ? { preheader: opts.preheader } : {}), fromName: business || "Strelva", blocks, footer: footer(business, opts.footerNote), footerLinks: footerLinks(opts) };
}

/* ---------- Booking mail ---------- */

export interface VisitorBookingMailInput {
  business: string;
  subject: string;
  preheader?: string;
  /** What happened, said once. The lede says what it means for the reader. */
  headline: string;
  lede?: string;
  /** "waits" when the reader must act, "live" when it is booked, "ended" when it is not. */
  status?: { tone: "waits" | "live" | "ended"; label: string };
  when: { day: string; time: string; detail?: string; struck?: boolean };
  /** One sentence under the time, e.g. where to go or how to change it. */
  note?: string;
  /** Times the reader can pick instead (a lapsed request), each a link. */
  choices?: { label: string; items: readonly XaMailAction[] };
  primary?: XaMailAction;
  link?: XaMailAction;
}

/** "9:15 AM Eastern Time" → the clock large, the zone small beside the day. */
export function splitZone(when: VisitorBookingMailInput["when"]): VisitorBookingMailInput["when"] {
  const match = /^(\d{1,2}:\d{2}\s?[AP]M)\s+(.+)$/.exec(when.time);
  return match ? { ...when, time: match[1]!, day: `${when.day} · ${match[2]}` } : when;
}

/** A booking email from the business: the time is the one thing on the page. */
export function visitorBookingMail(input: VisitorBookingMailInput): XaMail {
  return {
    subject: input.subject,
    ...(input.preheader ? { preheader: input.preheader } : {}),
    fromName: input.business,
    blocks: [
      { kind: "identity", business: input.business },
      ...(input.status ? [{ kind: "status" as const, ...input.status }] : []),
      { kind: "headline", text: input.headline, ...(input.lede ? { lede: input.lede } : {}) },
      { kind: "when", ...splitZone(input.when) },
      ...(input.note ? [{ kind: "sentence" as const, text: input.note }] : []),
      ...(input.choices?.items.length ? [{ kind: "choices" as const, ...input.choices }] : []),
      ...(input.primary ? [{ kind: "primary" as const, action: input.primary }] : []),
      ...(input.link ? [{ kind: "link" as const, action: input.link }] : []),
    ],
    footer: footer(input.business),
  };
}

/** A newsletter issue, with no Strelva credit. `html` must already be sanitized by `sanitizeEmailHtml`. */
export function visitorNewsletterMail(input: { business: string; subject: string; html: string; text: string; previewText?: string; unsubscribeUrl: string }): XaMail {
  return {
    subject: input.subject,
    ...(input.previewText ? { preheader: input.previewText } : {}),
    fromName: input.business,
    blocks: [
      { kind: "identity", business: input.business },
      { kind: "html", html: input.html, text: input.text },
    ],
    // A newsletter is entirely the business's: no platform credit (newsletter-send-path test).
    footer: `You get this because you signed up for ${input.business} news.`,
    footerLinks: [{ label: `Unsubscribe from ${input.business}`, url: input.unsubscribeUrl }],
  };
}
