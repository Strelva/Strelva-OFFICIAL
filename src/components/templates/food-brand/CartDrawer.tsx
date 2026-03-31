"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useCart, getItemPrice } from "@/lib/cart";

export function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQuantity,
    subtotal,
    amountToFreeShipping,
    freeShippingThreshold,
  } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeCart]);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setCheckingOut(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckingOut(false);
    }
  };

  const shippingProgress = Math.min(100, ((freeShippingThreshold - amountToFreeShipping) / freeShippingThreshold) * 100);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(26, 21, 16, 0.4)" }}
        onClick={closeCart}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-[420px] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--cream)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid var(--cream-mid)" }}
        >
          <h2 className="font-display text-xl tracking-tight" style={{ color: "var(--bark)" }}>
            Your Cart
          </h2>
          <button
            onClick={closeCart}
            className="opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Close cart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Free shipping progress */}
        {items.length > 0 && (
          <div className="px-6 py-3" style={{ background: "var(--cream-dark)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.625rem] font-semibold tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
                {amountToFreeShipping > 0
                  ? `$${amountToFreeShipping.toFixed(2)} away from free shipping`
                  : "Free shipping unlocked!"}
              </p>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={amountToFreeShipping === 0 ? "var(--sage)" : "var(--bark-faded)"} strokeWidth="1.5">
                <rect x="1" y="6" width="15" height="13" rx="1" />
                <path d="M16 10h4l3 4v5h-7V10z" />
                <circle cx="7" cy="20" r="1.5" />
                <circle cx="19" cy="20" r="1.5" />
              </svg>
            </div>
            <div
              className="w-full h-1 rounded-full overflow-hidden"
              style={{ background: "var(--cream-mid)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${shippingProgress}%`,
                  background: amountToFreeShipping === 0 ? "var(--sage)" : "var(--bark)",
                }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--cream-mid)" strokeWidth="1">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
              <p className="font-display text-lg tracking-tight mt-4 mb-2" style={{ color: "var(--bark)" }}>
                Your cart is empty
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--bark-faded)" }}>
                Add some snacks to get started.
              </p>
              <button
                onClick={closeCart}
                className="text-xs font-bold tracking-widest uppercase px-6 py-3 transition-all duration-300"
                style={{ background: "var(--bark)", color: "var(--cream)" }}
              >
                Shop Now
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {items.map((item) => {
                const unitPrice = getItemPrice(item);
                return (
                  <div
                    key={`${item.productId}-${item.subscription}`}
                    className="flex gap-4"
                    style={{ borderBottom: "1px solid var(--cream-mid)", paddingBottom: "1.25rem" }}
                  >
                    {/* Image */}
                    <div className="relative w-20 h-20 flex-shrink-0" style={{ background: "var(--cream-dark)" }}>
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-sm tracking-tight leading-tight" style={{ color: "var(--bark)" }}>
                            {item.name}
                          </h3>
                          {item.subscription && (
                            <p className="text-[0.5625rem] font-semibold tracking-wider uppercase mt-0.5" style={{ color: "var(--sage)" }}>
                              Subscribe &amp; Save 15%
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="opacity-30 hover:opacity-80 transition-opacity flex-shrink-0"
                          aria-label={`Remove ${item.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-end justify-between mt-3">
                        {/* Quantity */}
                        <div
                          className="inline-flex items-center gap-0"
                          style={{ border: "1px solid var(--cream-mid)" }}
                        >
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 flex items-center justify-center text-sm transition-opacity disabled:opacity-20"
                            style={{ color: "var(--bark)" }}
                          >
                            -
                          </button>
                          <span
                            className="w-7 h-7 flex items-center justify-center text-xs font-medium"
                            style={{ color: "var(--bark)", borderLeft: "1px solid var(--cream-mid)", borderRight: "1px solid var(--cream-mid)" }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center text-sm transition-opacity hover:opacity-60"
                            style={{ color: "var(--bark)" }}
                          >
                            +
                          </button>
                        </div>

                        {/* Price */}
                        <p className="font-display text-sm tracking-tight" style={{ color: "var(--bark)" }}>
                          ${(unitPrice * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div
            className="px-6 py-5"
            style={{ borderTop: "1px solid var(--cream-mid)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium tracking-wider uppercase" style={{ color: "var(--bark-faded)" }}>
                Subtotal
              </span>
              <span className="font-display text-lg tracking-tight" style={{ color: "var(--bark)" }}>
                ${subtotal.toFixed(2)}
              </span>
            </div>
            <p className="text-[0.5625rem] tracking-wider uppercase mb-4 text-center" style={{ color: "var(--bark-faded)" }}>
              Shipping &amp; taxes calculated at checkout
            </p>
            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="w-full py-3.5 text-xs font-bold tracking-widest uppercase transition-all duration-300 disabled:opacity-50"
              style={{ background: "var(--bark)", color: "var(--cream)" }}
              onMouseEnter={(e) => { if (!checkingOut) e.currentTarget.style.background = "var(--bark-light)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bark)"; }}
            >
              {checkingOut ? "Redirecting..." : "Checkout"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
