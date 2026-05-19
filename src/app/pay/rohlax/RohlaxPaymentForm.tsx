"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, CreditCard, Loader2, LockKeyhole } from "lucide-react";
import {
  ROHLAX_PAYMENT_INITIAL_CENTS,
  ROHLAX_PAYMENT_MAX_CENTS,
  ROHLAX_PAYMENT_MIN_CENTS,
  formatRohlaxPaymentAmount,
} from "@/lib/rohlax-payment";

const presetAmounts = [300, 450, 750];

export function RohlaxPaymentForm() {
  const [amount, setAmount] = useState(String(ROHLAX_PAYMENT_INITIAL_CENTS / 100));
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amountNumber = useMemo(() => Number.parseFloat(amount), [amount]);
  const amountIsValid = Number.isFinite(amountNumber) && amountNumber >= 300 && amountNumber <= 1000;
  const rangeAmount = Number.isFinite(amountNumber)
    ? Math.min(1000, Math.max(300, amountNumber))
    : ROHLAX_PAYMENT_INITIAL_CENTS / 100;
  const displayAmount = amountIsValid
    ? formatRohlaxPaymentAmount(Math.round(amountNumber * 100))
    : "Choose amount";

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!amountIsValid) {
      setError("Choose an amount from $300 to $1,000.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/pay/rohlax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
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
      className="rounded-[8px] border border-[#d7ddd4] bg-white p-5 shadow-[0_24px_70px_rgba(32,45,35,0.10)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#5f7667]">Choose any amount</p>
          <p className="mt-1 text-[30px] font-semibold leading-none text-[#172117] sm:text-[34px]">
            {displayAmount}
          </p>
          <p className="mt-2 text-[12px] leading-5 text-[#758579]">
            No default or expected amount.
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef4ec] text-[#456550]">
          <CreditCard size={20} strokeWidth={1.8} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {presetAmounts.map((preset) => {
          const selected = amountNumber === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={`h-11 rounded-[6px] border text-[14px] font-medium transition-colors ${
                selected
                  ? "border-[#456550] bg-[#456550] text-white"
                  : "border-[#d7ddd4] bg-[#f8faf7] text-[#304437] hover:border-[#8aa18f]"
              }`}
            >
              ${preset}
            </button>
          );
        })}
      </div>

      <label className="mt-5 block">
        <span className="text-[13px] font-medium text-[#5f7667]">Custom amount</span>
        <div className="mt-2 flex h-12 items-center rounded-[6px] border border-[#cfd8cc] bg-[#fbfcfa] px-3 focus-within:border-[#456550]">
          <span className="text-[16px] text-[#5f7667]">$</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            min={ROHLAX_PAYMENT_MIN_CENTS / 100}
            max={ROHLAX_PAYMENT_MAX_CENTS / 100}
            step="1"
            inputMode="decimal"
            type="number"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-[16px] font-medium text-[#172117] outline-none"
            aria-describedby="rohlax-payment-range"
          />
        </div>
      </label>

      <input
        className="mt-3 h-2 w-full accent-[#456550]"
        type="range"
        min={ROHLAX_PAYMENT_MIN_CENTS / 100}
        max={ROHLAX_PAYMENT_MAX_CENTS / 100}
        step="25"
        value={rangeAmount}
        onChange={(event) => setAmount(event.target.value)}
        aria-label="Payment amount"
      />

      <div id="rohlax-payment-range" className="mt-2 flex justify-between text-[12px] text-[#758579]">
        <span>{formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MIN_CENTS)} minimum</span>
        <span>{formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MAX_CENTS)} ceiling</span>
      </div>

      {!amountIsValid && amount.trim() && (
        <p className="mt-3 text-[13px] text-[#8a3d28]">
          Enter an amount from $300 to $1,000.
        </p>
      )}
      {amountIsValid && (
        <p className="mt-3 text-[13px] leading-5 text-[#758579]">
          The top of the range is only a cap. Choose what feels right.
        </p>
      )}

      <div className="mt-4 rounded-[6px] border border-[#d7ddd4] bg-[#f8faf7] px-3 py-3 text-[12px] leading-5 text-[#5f7667]">
        Admin site access is guaranteed free for life. This courtesy payment does not change future
        response times or include extra coverage at this moment. All website requests are handled in
        the normal 3-5 day response window.
      </div>

      <label className="mt-5 block">
        <span className="text-[13px] font-medium text-[#5f7667]">Email for receipt</span>
        <input
          value={customerEmail}
          onChange={(event) => setCustomerEmail(event.target.value)}
          type="email"
          placeholder="you@example.com"
          className="mt-2 h-12 w-full rounded-[6px] border border-[#cfd8cc] bg-[#fbfcfa] px-3 text-[15px] text-[#172117] outline-none transition-colors placeholder:text-[#9aa89d] focus:border-[#456550]"
        />
      </label>

      {error && (
        <p className="mt-4 rounded-[6px] border border-[#e7b9a8] bg-[#fff5f0] px-3 py-2 text-[13px] leading-5 text-[#8a3d28]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !amountIsValid}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#172117] px-4 text-[15px] font-medium text-white transition-colors hover:bg-[#263728] disabled:cursor-not-allowed disabled:bg-[#a9b5aa]"
      >
        {loading ? (
          <>
            <Loader2 size={17} className="animate-spin" />
            Opening secure checkout
          </>
        ) : (
          <>
            Pay securely with Stripe
            <ArrowRight size={17} />
          </>
        )}
      </button>

      <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[#758579]">
        <LockKeyhole size={14} />
        Secure card payment handled by Stripe
      </p>
    </form>
  );
}
