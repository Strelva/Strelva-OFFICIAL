"use client";

/**
 * Fail-silent GA4 (Google Analytics 4) tag for custom-repo client sites.
 *
 * Drop this file into a per-client repo and render <ScaffoldGA4 /> once in the
 * root layout (right next to <ScaffoldTracker />). When
 * NEXT_PUBLIC_GA4_MEASUREMENT_ID is set it loads gtag.js and starts sending GA4
 * pageviews automatically; when the var is unset it is a COMPLETE no-op — it
 * renders nothing and loads nothing, so a site with no GA4 property configured
 * is entirely unaffected. Because Strelva hosts the site, the operator just sets
 * the one env var and analytics wires itself up — no per-build hand-coding.
 *
 * Self-contained on purpose: this file imports only React + standard browser
 * APIs (no `@/lib/...` and no `next/script`), so it is a true single-file
 * drop-in and typechecks inside this control-plane repo as well as any client
 * repo — the same contract ScaffoldTracker follows.
 *
 * Design rules (mirror ScaffoldTracker — never risk the client site):
 *   - No-op when unset. A missing/empty env var loads nothing and renders nothing.
 *   - Fail silent. Any DOM error is swallowed; the site never breaks.
 *   - No hydration risk. The component renders null on the server AND the client;
 *     the tag is injected in an effect that only runs in the browser, so there is
 *     no server/client markup to mismatch.
 *   - CSP-friendly. It injects only an external `src` loader script (no inline
 *     <script>, no inline handlers, no eval) and pushes config to
 *     window.dataLayer from the already-loaded bundle. The single CSP requirement
 *     is allowing the loader host `https://www.googletagmanager.com` in
 *     `script-src` — that is true of ANY GA4 install, inline-snippet or not.
 *   - Idempotent. Injects the loader at most once per page.
 *
 * Env (set in the client repo, browser-inlined by Next.js because it is a
 * NEXT_PUBLIC_* var):
 *   - NEXT_PUBLIC_GA4_MEASUREMENT_ID   GA4 Measurement ID, e.g. "G-XXXXXXXXXX"
 */

import { useEffect } from "react";

const LOADER_ID = "scaffold-ga4";
const GTAG_SRC = "https://www.googletagmanager.com/gtag/js";

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/** Browser-safe GA4 Measurement ID. Only the NEXT_PUBLIC_* var is readable in
 *  the browser; a missing var just disables analytics (never throws). */
function getMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  return id && id.trim() ? id.trim() : null;
}

/**
 * Inject gtag.js for `measurementId` into `doc` and initialize GA4 on `win`.
 * Pure + injectable (win/doc are passed in) so it is unit-testable in node
 * without a DOM renderer. No-ops (returns false) when `measurementId` is empty
 * or the loader is already present. Never throws — a tag failure must not break
 * the client site.
 */
export function injectGa4Tag(win: GtagWindow, doc: Document, measurementId: string): boolean {
  try {
    const id = measurementId.trim();
    if (!id) return false;
    if (doc.getElementById(LOADER_ID)) return false;

    const script = doc.createElement("script");
    script.id = LOADER_ID;
    script.async = true;
    script.src = `${GTAG_SRC}?id=${encodeURIComponent(id)}`;
    (doc.head || doc.documentElement).appendChild(script);

    win.dataLayer = win.dataLayer || [];
    // Google's exact gtag() stub: push the `arguments` object (NOT a plain
    // array) so the loaded gtag.js reads these as GA4 commands. gtag.js
    // specifically expects arguments objects here, so a rest-param array will
    // not be interpreted as commands — the `arguments` usage is required.
    function gtag(..._args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    }
    win.gtag = gtag;
    gtag("js", new Date());
    gtag("config", id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders nothing. Mount once in the root layout to start GA4 pageview tracking
 * when NEXT_PUBLIC_GA4_MEASUREMENT_ID is set; a complete no-op when it is not.
 */
export function ScaffoldGA4() {
  useEffect(() => {
    const id = getMeasurementId();
    if (!id) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    injectGa4Tag(window as unknown as GtagWindow, document, id);
  }, []);

  return null;
}
