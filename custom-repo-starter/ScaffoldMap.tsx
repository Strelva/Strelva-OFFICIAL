/**
 * Scaffold Web map embed for custom-repo client sites.
 *
 * Renders a lazy, responsive Google Maps embed from an address, a place query,
 * or lat/lng — with NO API key required (uses the keyless
 * `maps.google.com/maps?...&output=embed` iframe). Every local-business build
 * wants a "find us" map; this is the drop-in.
 *
 * Server-safe on purpose: NO "use client". The embed is a plain `<iframe>`, so
 * it renders identical markup on server and client (no hydration mismatch) and
 * ships no client JS. Self-contained: imports only React (no `@/lib/...`).
 *
 * Fail-silent: with no address, query, or coordinates it renders NOTHING (never
 * a broken/empty map). It never throws.
 *
 * CSP: the embed loads inside an iframe from Google Maps. Under a strict CSP,
 * allow `https://maps.google.com` (and `https://www.google.com`) in `frame-src`.
 * No `script-src` change is needed — this injects no script.
 *
 * Usage (server component, e.g. a contact section):
 *
 *   import { ScaffoldMap } from "@/components/ScaffoldMap";
 *
 *   <ScaffoldMap address="12 Main St, Buffalo, NY 14201" />
 *   <ScaffoldMap lat={42.8864} lng={-78.8784} zoom={15} />
 */

import type { ReactElement } from "react";

export interface ScaffoldMapProps {
  /** Street address to center on, e.g. "12 Main St, Buffalo, NY 14201". */
  address?: string;
  /** A place query (business name + city) — an alternative to `address`. */
  query?: string;
  /** Latitude (paired with `lng`). Takes priority over address/query. */
  lat?: number;
  /** Longitude (paired with `lat`). */
  lng?: number;
  /** Zoom level 1–20. Default 14. */
  zoom?: number;
  /** Accessible iframe title. Default "Map". */
  title?: string;
  /** Responsive aspect ratio W/H. Default 16/9. Ignored when `height` is set. */
  aspectRatio?: number;
  /** Fixed pixel height instead of an aspect ratio. */
  height?: number | string;
  /** Class hook for the wrapper. */
  className?: string;
}

/**
 * Build the keyless Google Maps embed URL from the props. Coordinates win over
 * address, address over query. Returns null when nothing usable is provided
 * (the fail-silent signal). Pure + exported so it is unit-testable.
 */
export function buildMapEmbedUrl(props: ScaffoldMapProps): string | null {
  const zoom = Number.isFinite(props.zoom) ? Math.min(20, Math.max(1, Math.round(props.zoom as number))) : 14;

  let q: string | null = null;
  if (Number.isFinite(props.lat) && Number.isFinite(props.lng)) {
    q = `${props.lat},${props.lng}`;
  } else {
    const place = props.address?.trim() || props.query?.trim();
    if (place) q = place;
  }
  if (!q) return null;

  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`;
}

/**
 * Renders a lazy, responsive, keyless Google Maps embed. Returns null when no
 * location is provided.
 */
export function ScaffoldMap(props: ScaffoldMapProps): ReactElement | null {
  const src = buildMapEmbedUrl(props);
  if (!src) return null;

  const title = props.title?.trim() || "Map";

  // Fixed height, or a responsive aspect-ratio box (padding-bottom trick — no CSS
  // dependency, works everywhere).
  if (props.height !== undefined) {
    return (
      <div className={props.className} style={{ width: "100%" }}>
        <iframe
          src={src}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, width: "100%", height: typeof props.height === "number" ? `${props.height}px` : props.height }}
        />
      </div>
    );
  }

  const ratio = Number.isFinite(props.aspectRatio) && (props.aspectRatio as number) > 0 ? (props.aspectRatio as number) : 16 / 9;
  const paddingBottom = `${(1 / ratio) * 100}%`;
  return (
    <div className={props.className} style={{ position: "relative", width: "100%", paddingBottom }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ position: "absolute", inset: 0, border: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
