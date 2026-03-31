"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";

export function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  const { amountToFreeShipping, freeShippingThreshold } = useCart();

  if (dismissed) return null;

  const message =
    amountToFreeShipping > 0
      ? `Free Shipping on Orders $${freeShippingThreshold}+`
      : "You've unlocked Free Shipping!";

  return (
    <div
      id="announcement-bar"
      className="relative z-50 py-2.5 text-center"
      style={{ background: "var(--bark)", color: "var(--cream)" }}
    >
      <div className="container-main flex items-center justify-center gap-3">
        <p className="text-[0.625rem] sm:text-xs font-semibold tracking-[0.18em] uppercase">
          {message}
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
