"use client";

import {
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import {
  ROHLAX_PAYMENT_INITIAL_CENTS,
  ROHLAX_PAYMENT_MAX_CENTS,
  ROHLAX_PAYMENT_MIN_CENTS,
  formatRohlaxPaymentAmount,
} from "@/lib/rohlax-payment";

// $1 granularity so dragging is fully continuous — no chunky interval jumps.
const SLIDER_SNAP = 1;
const SLIDER_PAGE = 50; // PageUp / PageDown keyboard jump
const THUMB_PX = 26;
const GLIDE = "0.5s cubic-bezier(0.22, 1, 0.36, 1)";

function AmountSlider({
  value,
  min,
  max,
  onChange,
  valueText,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  valueText: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const clamp = useCallback(
    (next: number) => {
      const bounded = Math.min(max, Math.max(min, next));
      return Math.round(bounded / SLIDER_SNAP) * SLIDER_SNAP;
    },
    [min, max]
  );

  const ratio = max > min ? (value - min) / (max - min) : 0;
  // Position the thumb centre inside the track so it never clips at the ends.
  const position = `calc(${ratio} * (100% - ${THUMB_PX}px) + ${THUMB_PX / 2}px)`;
  const lifted = dragging || hovered || focused;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const usable = rect.width - THUMB_PX;
      const raw = usable > 0 ? (clientX - rect.left - THUMB_PX / 2) / usable : 0;
      onChange(clamp(min + Math.min(1, Math.max(0, raw)) * (max - min)));
    },
    [clamp, min, max, onChange]
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setFromClientX(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) setFromClientX(event.clientX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // capture may already be gone — safe to ignore
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + SLIDER_SNAP;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - SLIDER_SNAP;
        break;
      case "PageUp":
        next = value + SLIDER_PAGE;
        break;
      case "PageDown":
        next = value - SLIDER_PAGE;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(clamp(next));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Payment amount"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="relative flex h-7 w-full touch-none items-center outline-none"
      style={{ cursor: dragging ? "grabbing" : "pointer" }}
    >
      {/* Track */}
      <div className="pointer-events-none absolute inset-x-0 h-2 rounded-full bg-[rgba(20,25,40,0.1)]" />
      {/* Fill */}
      <div
        className="pointer-events-none absolute left-0 h-2 rounded-full bg-[#1d1d1f]"
        style={{ width: position, transition: dragging ? "none" : `width ${GLIDE}` }}
      />
      {/* Thumb */}
      <div
        className="pointer-events-none absolute rounded-full bg-white"
        style={{
          left: position,
          width: THUMB_PX,
          height: THUMB_PX,
          transform: `translateX(-50%) scale(${dragging ? 1.08 : lifted ? 1.04 : 1})`,
          transition: dragging
            ? "transform 0.15s ease"
            : `left ${GLIDE}, transform 0.15s ease`,
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: focused
            ? "0 0 0 4px rgba(29,29,31,0.18), 0 4px 12px rgba(20,30,60,0.28)"
            : "0 4px 12px rgba(20,30,60,0.28), 0 1px 2px rgba(0,0,0,0.12)",
        }}
      />
    </div>
  );
}

export function RohlaxPaymentForm() {
  const min = ROHLAX_PAYMENT_MIN_CENTS / 100;
  const max = ROHLAX_PAYMENT_MAX_CENTS / 100;

  // Amount in whole dollars; defaults to $500 and is driven by the slider.
  const [amount, setAmount] = useState(ROHLAX_PAYMENT_INITIAL_CENTS / 100);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amountLabel = formatRohlaxPaymentAmount(Math.round(amount * 100));

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/pay/rohlax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: String(amount),
          customerEmail: customerEmail.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        setError(data.error || "Could not open secure checkout.");
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setError("Could not open secure checkout. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={startCheckout}
      autoComplete="off"
      className="reb-rise w-full rounded-[28px] border border-white/70 bg-white/55 p-6 shadow-[0_30px_90px_-30px_rgba(28,40,70,0.45)] backdrop-blur-2xl sm:p-7"
      style={{ animationDelay: "240ms" }}
    >
      {/* Amount hero — tracks the slider live */}
      <div className="flex flex-col items-center text-center">
        <span className="text-[13px] font-medium text-[#6e6e73]">Your website</span>
        <div className="mt-1.5 flex items-start justify-center text-[#1d1d1f]">
          <span className="mt-[10px] text-[26px] font-semibold">$</span>
          <span className="text-[58px] font-semibold leading-none tracking-[-0.035em] tabular-nums">
            {amount.toLocaleString("en-US")}
          </span>
        </div>
        <span className="mt-2.5 text-[13px] text-[#86868b]">
          $500 covers it · add more if you&rsquo;d like
        </span>
      </div>

      {/* Slider */}
      <div className="mt-7 px-1">
        <AmountSlider
          value={amount}
          min={min}
          max={max}
          onChange={setAmount}
          valueText={amountLabel}
        />
        <div className="mt-2.5 flex justify-between text-[12px] font-medium text-[#86868b]">
          <span>${min.toLocaleString("en-US")}</span>
          <span>${max.toLocaleString("en-US")}</span>
        </div>
      </div>

      {/* One-time reassurance — honest: paid once, nothing recurring */}
      <div className="mt-6 rounded-2xl border border-white/60 bg-white/35 px-4 py-3 text-center text-[13px] leading-5 text-[#6e6e73]">
        A one-time payment — no subscription, no monthly fees, ever. Your site and dashboard are
        yours.
      </div>

      {/* Email */}
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-[#6e6e73]">
          Email for your receipt
        </span>
        <input
          value={customerEmail}
          onChange={(event) => setCustomerEmail(event.target.value)}
          type="email"
          placeholder="you@example.com"
          className="h-12 w-full rounded-2xl border border-white/70 bg-white/45 px-4 text-[15px] text-[#1d1d1f] outline-none transition-colors placeholder:text-[#9a9aa0] focus:border-[#1d1d1f]/25 focus:bg-white/80"
        />
      </label>

      {error && (
        <p className="mt-4 rounded-2xl border border-[#f0c9b8] bg-[#fff4ee]/80 px-4 py-2.5 text-center text-[13px] text-[#b23a16]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-5 text-[15px] font-medium text-white transition-all duration-200 hover:bg-black hover:shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c4c4c9] disabled:shadow-none"
      >
        {loading ? (
          <>
            <Loader2 size={17} className="animate-spin" />
            Opening secure checkout
          </>
        ) : (
          <>
            Continue · {amountLabel}
            <ArrowRight size={16} />
          </>
        )}
      </button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-[#86868b]">
        <Lock size={13} />
        Secure checkout · powered by Stripe
      </p>
    </form>
  );
}
