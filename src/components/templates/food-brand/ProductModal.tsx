"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import type { ProductItem } from "@/lib/types";

const SUBSCRIPTION_INTERVALS = ["2 weeks", "4 weeks", "6 weeks", "8 weeks"];

function canRenderProductImage(src: string) {
  return !!src && !src.startsWith("/images/");
}

interface ProductModalProps {
  product: ProductItem | null;
  onClose: () => void;
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isSubscription, setIsSubscription] = useState(false);
  const [interval, setInterval] = useState("4 weeks");
  const [added, setAdded] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset per-product state when the selected product changes
  // (derived-state pattern, no effect needed).
  const [prevProductId, setPrevProductId] = useState(product?.id);
  if (product?.id !== prevProductId) {
    setPrevProductId(product?.id);
    setQuantity(1);
    setIsSubscription(false);
    setInterval("4 weeks");
    setAdded(false);
  }

  // Lock body scroll
  useEffect(() => {
    if (product) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [product]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!product) return null;

  const basePrice = parseFloat(product.price || "0");
  const discountedPrice = basePrice * 0.85;
  const displayPrice = isSubscription ? discountedPrice : basePrice;

  const handleAdd = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: basePrice,
      imageUrl: product.imageUrl,
      subscription: isSubscription,
      subscriptionInterval: isSubscription ? interval : undefined,
      quantity,
    });
    setAdded(true);
    setTimeout(() => onClose(), 600);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[70] animate-popup"
        style={{ background: "rgba(26, 21, 16, 0.5)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      >
        {/* Modal */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[860px] max-h-[90vh] overflow-y-auto"
          style={{ background: "var(--cream)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="grid md:grid-cols-2">
            {/* Left — Image */}
            <div className="relative aspect-square" style={{ background: "var(--cream-dark)" }}>
              {canRenderProductImage(product.imageUrl) ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 768px) 430px, 92vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                  <span className="font-display text-3xl tracking-tight" style={{ color: "var(--sage)" }}>
                    {product.name}
                  </span>
                </div>
              )}
              {product.badge && (
                <span
                  className="absolute top-4 left-4 text-[0.5625rem] font-bold tracking-widest uppercase px-3 py-1.5"
                  style={{ background: "var(--sage)", color: "var(--cream)" }}
                >
                  {product.badge}
                </span>
              )}
            </div>

            {/* Right — Details */}
            <div className="p-8 md:p-10 flex flex-col">
              <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-2" style={{ color: "var(--bark)" }}>
                {product.name}
              </h2>

              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--bark-light)" }}>
                {product.description}
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-3 mb-6">
                <span className="font-display text-2xl tracking-tight" style={{ color: "var(--bark)" }}>
                  ${displayPrice.toFixed(2)}
                </span>
                {isSubscription && (
                  <span className="text-xs line-through" style={{ color: "var(--bark-faded)" }}>
                    ${basePrice.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Purchase type toggle */}
              <div className="mb-6">
                <div
                  className="flex gap-0"
                  style={{ border: "1px solid var(--cream-mid)" }}
                >
                  <button
                    onClick={() => setIsSubscription(false)}
                    aria-pressed={!isSubscription}
                    className="flex-1 py-3 text-[0.625rem] font-bold tracking-[0.15em] uppercase transition-all duration-200"
                    style={{
                      background: !isSubscription ? "var(--bark)" : "transparent",
                      color: !isSubscription ? "var(--cream)" : "var(--bark-faded)",
                    }}
                  >
                    One Time
                  </button>
                  <button
                    onClick={() => setIsSubscription(true)}
                    aria-pressed={isSubscription}
                    className="flex-1 py-3 text-[0.625rem] font-bold tracking-[0.15em] uppercase transition-all duration-200"
                    style={{
                      background: isSubscription ? "var(--bark)" : "transparent",
                      color: isSubscription ? "var(--cream)" : "var(--bark-faded)",
                      borderLeft: "1px solid var(--cream-mid)",
                    }}
                  >
                    Subscribe &amp; Save 15%
                  </button>
                </div>

                {/* Subscription interval */}
                {isSubscription && (
                  <div className="mt-3">
                    <label className="text-[0.5625rem] font-semibold tracking-[0.15em] uppercase block mb-2" style={{ color: "var(--bark-faded)" }}>
                      Delivery Every
                    </label>
                    <select
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      className="w-full py-2.5 px-3 text-sm appearance-none cursor-pointer"
                      style={{
                        background: "var(--cream-dark)",
                        color: "var(--bark)",
                        border: "1px solid var(--cream-mid)",
                        borderRadius: 0,
                      }}
                    >
                      {SUBSCRIPTION_INTERVALS.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4 mb-6">
                <label className="text-[0.5625rem] font-semibold tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
                  Qty
                </label>
                <div
                  className="inline-flex items-center"
                  style={{ border: "1px solid var(--cream-mid)" }}
                >
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-9 h-9 flex items-center justify-center text-sm transition-opacity disabled:opacity-20"
                    style={{ color: "var(--bark)" }}
                  >
                    -
                  </button>
                  <span
                    className="w-9 h-9 flex items-center justify-center text-sm font-medium"
                    style={{ color: "var(--bark)", borderLeft: "1px solid var(--cream-mid)", borderRight: "1px solid var(--cream-mid)" }}
                  >
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-9 h-9 flex items-center justify-center text-sm transition-opacity hover:opacity-60"
                    style={{ color: "var(--bark)" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Add to cart */}
              <button
                onClick={handleAdd}
                disabled={product.comingSoon || !product.price}
                aria-label={`Add ${quantity} ${product.name} to cart`}
                data-testid={`modal-add-to-cart-${product.id}`}
                className="w-full py-3.5 text-xs font-bold tracking-widest uppercase transition-all duration-300 disabled:opacity-40 mt-auto"
                style={{
                  background: added ? "var(--sage)" : "var(--bark)",
                  color: "var(--cream)",
                }}
                onMouseEnter={(e) => { if (!added) e.currentTarget.style.background = "var(--bark-light)"; }}
                onMouseLeave={(e) => { if (!added) e.currentTarget.style.background = "var(--bark)"; }}
              >
                {product.comingSoon ? "Coming Soon" : added ? "Added!" : "Add to Cart"}
              </button>

              {/* Ingredients */}
              {product.ingredients && (
                <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--cream-mid)" }}>
                  <p className="text-[0.5625rem] font-semibold tracking-[0.15em] uppercase mb-1" style={{ color: "var(--bark-faded)" }}>
                    Ingredients
                  </p>
                  <p className="text-sm" style={{ color: "var(--bark-light)" }}>
                    {product.ingredients}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
