"use client";

import { useState, useEffect } from "react";

export function EmailPopup() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem("reb-popup-dismissed");
    if (stored) {
      try {
        const d = JSON.parse(stored);
        if (d.expiry && Date.now() < d.expiry) return;
      } catch {
        return;
      }
    }

    const timer = setTimeout(() => setOpen(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setOpen(false);
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "reb-popup-dismissed",
      JSON.stringify({ dismissed: true, expiry })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return;
    } catch {
      return;
    }
    setSubmitted(true);
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "reb-popup-dismissed",
      JSON.stringify({ dismissed: true, expiry })
    );
    setTimeout(() => setOpen(false), 2500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={dismiss}
    >
      <div className="absolute inset-0 bg-[rgba(13,12,11,0.52)] backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md p-8 md:p-10 animate-popup"
        style={{
          background: "var(--cream)",
          boxShadow: "0 25px 50px -12px rgba(44,36,24,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-60"
          style={{ color: "var(--bark-faded)" }}
          aria-label="Close"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <div
              className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: "var(--sage)", color: "white" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3
              className="font-display text-2xl tracking-tight mb-2"
              style={{ color: "var(--bark)" }}
            >
              You&apos;re in!
            </h3>
            <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
              We&apos;ll let you know when we launch.
            </p>
          </div>
        ) : (
          <>
            <h3
              className="font-display text-3xl md:text-4xl tracking-tight leading-[1.1] mb-3"
              style={{ color: "var(--bark)" }}
            >
              Get first dibs.
            </h3>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: "var(--bark-faded)" }}
            >
              Be the first to try our hand-sliced apple chips — made with
              NYS-grown fruit, zero preservatives, and a whole lot of crunch.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3.5 text-sm outline-none transition-all"
                style={{
                  background: "var(--cream-dark)",
                  color: "var(--bark)",
                  border: "1px solid var(--cream-mid)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--sage)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--cream-mid)";
                }}
              />
              <button
                type="submit"
                className="w-full py-3.5 text-xs font-bold tracking-widest uppercase transition-all duration-300"
                style={{
                  background: "var(--bark)",
                  color: "var(--cream)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bark-light)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bark)";
                }}
              >
                Notify Me
              </button>
            </form>

            <p
              className="text-[0.625rem] mt-4 text-center tracking-wide"
              style={{ color: "var(--bark-faded)" }}
            >
              No spam. Just launch updates & early access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
