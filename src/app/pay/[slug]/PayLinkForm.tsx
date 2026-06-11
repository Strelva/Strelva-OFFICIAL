"use client";

import { CSSProperties, FormEvent, useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { formatWholeDollarsUsd } from "@/lib/currency";
import { payLinkReassurance } from "@/lib/pay-link-copy";

const STEP_DOLLARS = 50;

export interface PayLinkFormProps {
  slug: string;
  /** Door this link sells — drives the reassurance copy under the amount. */
  door: "build" | "managed_start";
  /** Fixed price in cents, when the link is a fixed-amount link. */
  amountCents?: number;
  /** Range bounds in cents, when the link is a slider link. */
  minCents?: number;
  maxCents?: number;
}

export function PayLinkForm({ slug, door, amountCents, minCents, maxCents }: PayLinkFormProps) {
  const isFixed = typeof amountCents === "number";
  const min = isFixed ? (amountCents as number) / 100 : (minCents ?? 0) / 100;
  const max = isFixed ? (amountCents as number) / 100 : (maxCents ?? 0) / 100;

  // Amount in whole dollars; defaults to the floor and is driven by the slider.
  const [amount, setAmount] = useState(min);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pct = max > min ? ((amount - min) / (max - min)) * 100 : 100;
  const amountLabel = formatWholeDollarsUsd(Math.round(amount * 100));

  const reassurance = payLinkReassurance({ door, amountCents, minCents, maxCents });

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/pay/${slug}`, {
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
      <style jsx global>{`
        .pay-amount-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 28px;
          background: transparent;
          cursor: pointer;
        }
        .pay-amount-slider:focus { outline: none; }
        .pay-amount-slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #1d1d1f 0%,
            #1d1d1f var(--pct),
            rgba(20, 25, 40, 0.1) var(--pct),
            rgba(20, 25, 40, 0.1) 100%
          );
        }
        .pay-amount-slider::-moz-range-track {
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #1d1d1f 0%,
            #1d1d1f var(--pct),
            rgba(20, 25, 40, 0.1) var(--pct),
            rgba(20, 25, 40, 0.1) 100%
          );
        }
        .pay-amount-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          margin-top: -9px;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 12px rgba(20, 30, 60, 0.28), 0 1px 2px rgba(0, 0, 0, 0.12);
          cursor: grab;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .pay-amount-slider::-moz-range-thumb {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 12px rgba(20, 30, 60, 0.28), 0 1px 2px rgba(0, 0, 0, 0.12);
          cursor: grab;
        }
        .pay-amount-slider:active::-webkit-slider-thumb {
          cursor: grabbing;
          transform: scale(1.08);
        }
        .pay-amount-slider:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 4px rgba(29, 29, 31, 0.18), 0 4px 12px rgba(20, 30, 60, 0.28);
        }
        .pay-amount-slider:focus-visible::-moz-range-thumb {
          box-shadow: 0 0 0 4px rgba(29, 29, 31, 0.18), 0 4px 12px rgba(20, 30, 60, 0.28);
        }
      `}</style>

      {/* Amount hero — tracks the slider live */}
      <div className="flex flex-col items-center text-center">
        <span className="text-[13px] font-medium text-[#6e6e73]">
          {door === "build" ? "Your website build" : "Your start payment"}
        </span>
        <div className="mt-1.5 flex items-start justify-center text-[#1d1d1f]">
          <span className="mt-[10px] text-[26px] font-semibold">$</span>
          <span className="text-[58px] font-semibold leading-none tracking-[-0.035em] tabular-nums">
            {amount.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      {/* Slider — only when this is a range link */}
      {!isFixed && (
        <div className="mt-7 px-1">
          <input
            type="range"
            min={min}
            max={max}
            step={STEP_DOLLARS}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            aria-label="Payment amount"
            aria-valuetext={amountLabel}
            className="pay-amount-slider"
            style={{ "--pct": `${pct}%` } as CSSProperties}
          />
          <div className="mt-2.5 flex justify-between text-[12px] font-medium text-[#86868b]">
            <span>${min.toLocaleString("en-US")}</span>
            <span>${max.toLocaleString("en-US")}</span>
          </div>
        </div>
      )}

      {/* Door-specific reassurance */}
      <div className="mt-6 rounded-2xl border border-white/60 bg-white/35 px-4 py-3 text-center text-[13px] leading-5 text-[#6e6e73]">
        {reassurance}
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
