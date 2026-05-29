"use client";

import { useEffect, useRef } from "react";

const VALID_SECTION_RE = /^[a-zA-Z0-9_-]+$/;

/** Listens for postMessage from dashboard iframe to scroll to sections */
export function IframeScrollListener() {
  const trustedOriginRef = useRef<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin || event.origin === "null") return;

      // Establish trust on first reb-* message
      if (!trustedOriginRef.current && event.data?.type?.startsWith("reb-")) {
        trustedOriginRef.current = event.origin;
      }
      if (event.origin !== trustedOriginRef.current) return;

      if (event.data?.type === "reb-scroll-to" && VALID_SECTION_RE.test(event.data.section)) {
        const el = document.getElementById(event.data.section);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}
