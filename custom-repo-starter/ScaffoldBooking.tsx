/**
 * Scaffold Web booking embed for custom-repo client sites.
 *
 * Wraps a booking widget in a lazy, responsive iframe — Calendly or any generic
 * iframe-embeddable booking URL (Acuity, Cal.com, SavvyCal, a practice-management
 * scheduler, …). "Book online" is the Growth-tier transact promise; this is the
 * drop-in.
 *
 * Server-safe on purpose: NO "use client". Booking is embedded as a plain
 * `<iframe>`, so it renders identical markup on server and client (no hydration
 * mismatch) and ships no client JS. Self-contained: imports only React (no
 * `@/lib/...`).
 *
 * Why an iframe instead of Calendly's widget script: the iframe embed needs no
 * external `<script>`, so there is no extra `script-src` to allow and nothing to
 * load-and-init on the client. Calendly URLs render directly in an iframe when
 * you pass `embed_type=Inline` — which `buildBookingEmbedUrl` adds for you.
 *
 * Fail-silent: with no `url` it renders NOTHING (never a broken/empty widget). A
 * non-http(s) url is rejected the same way. It never throws.
 *
 * CSP: the booking page loads inside an iframe. Under a strict CSP, allow the
 * provider host in `frame-src` (e.g. `https://calendly.com`). No `script-src`
 * change is needed.
 *
 * Usage (server component):
 *
 *   import { ScaffoldBooking } from "@/components/ScaffoldBooking";
 *
 *   <ScaffoldBooking url="https://calendly.com/green-leaf/cleaning" />
 *   <ScaffoldBooking provider="iframe" url="https://app.acuityscheduling.com/schedule.php?owner=123" />
 */

import type { ReactElement } from "react";

export type BookingProvider = "calendly" | "iframe";

export interface ScaffoldBookingProps {
  /** The booking URL. Required to render anything (fail-silent when absent). */
  url?: string;
  /**
   * Which embed shape to build. Default: inferred — "calendly" when the url is a
   * calendly.com link, otherwise "iframe" (the URL is embedded as-is).
   */
  provider?: BookingProvider;
  /** Accessible iframe title. Default "Book an appointment". */
  title?: string;
  /** Iframe height in px (or any CSS length). Default 700. */
  height?: number | string;
  /** Calendly: hide the GDPR cookie banner. Default true. */
  hideGdprBanner?: boolean;
  /** Calendly: hide the event-type details column. Default false. */
  hideEventTypeDetails?: boolean;
  /** Class hook for the wrapper. */
  className?: string;
}

/** Pick the provider: explicit prop wins, else infer from the url's host. */
export function resolveBookingProvider(url: string, provider?: BookingProvider): BookingProvider {
  if (provider) return provider;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "calendly.com" || host.endsWith(".calendly.com") ? "calendly" : "iframe";
  } catch {
    return "iframe";
  }
}

/**
 * Build the iframe `src` for the booking widget. Returns null for an empty or
 * non-http(s) url (the fail-silent signal). For Calendly it appends the inline
 * embed params (preserving any existing query); for a generic provider it
 * returns the trimmed url unchanged. Pure + exported so it is unit-testable.
 */
export function buildBookingEmbedUrl(
  provider: BookingProvider | undefined,
  url: string | undefined,
  opts?: { hideGdprBanner?: boolean; hideEventTypeDetails?: boolean },
): string | null {
  const raw = url?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;

  const resolved = resolveBookingProvider(raw, provider);
  if (resolved !== "calendly") return raw;

  // Calendly inline embed params — merged onto whatever query is already there.
  const [base, existingQuery = ""] = raw.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("embed_type", "Inline");
  if (opts?.hideGdprBanner ?? true) params.set("hide_gdpr_banner", "1");
  if (opts?.hideEventTypeDetails) params.set("hide_event_type_details", "1");
  return `${base}?${params.toString()}`;
}

/**
 * Renders a lazy, responsive booking iframe. Returns null when no url is given.
 */
export function ScaffoldBooking(props: ScaffoldBookingProps): ReactElement | null {
  const src = buildBookingEmbedUrl(props.provider, props.url, {
    hideGdprBanner: props.hideGdprBanner,
    hideEventTypeDetails: props.hideEventTypeDetails,
  });
  if (!src) return null;

  const title = props.title?.trim() || "Book an appointment";
  const height = props.height === undefined ? "700px" : typeof props.height === "number" ? `${props.height}px` : props.height;

  return (
    <div className={props.className} style={{ width: "100%" }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        style={{ border: 0, width: "100%", height, minWidth: 0 }}
      />
    </div>
  );
}
