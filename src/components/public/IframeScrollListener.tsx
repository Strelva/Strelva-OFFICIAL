"use client";

import { useEffect } from "react";

/** Listens for postMessage from dashboard iframe to scroll to sections */
export function IframeScrollListener() {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "reb-scroll-to" && event.data.section) {
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
