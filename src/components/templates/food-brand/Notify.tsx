"use client";

import { useState } from "react";
export function Notify() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "already" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.already ? "already" : "success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section
      id="notify"
      className="py-10 md:py-14"
      style={{ background: "var(--sage-dark)" }}
    >
      <div className="container-main">
        <div className="max-w-xl">
          <h2
            className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] mb-4"
            style={{ color: "var(--cream)" }}
          >
            Two ingredients.
            <br />
            Zero compromises.
          </h2>

          <p
            className="text-base md:text-lg leading-relaxed mb-8"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            We&apos;re getting ready to launch. Drop your email and be the first to get a bag.
          </p>

          {/* Scarcity signal */}
          <div
            className="flex items-center gap-4 mb-8 pb-6"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span
              className="font-display text-4xl md:text-5xl tracking-tight leading-none"
              style={{ color: "var(--wheat)" }}
            >
              100
            </span>
            <span
              className="text-xs tracking-wider uppercase leading-tight"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              First batch bags<br />reserved for early list
            </span>
          </div>

          <div>
            {status === "success" || status === "already" ? (
              <div className="flex items-center gap-3">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--wheat)" }}
                />
                <p
                  className="text-sm font-medium tracking-wider uppercase"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {status === "already" ? "You\u2019re already on the list" : "You\u2019re on the list"}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-5 py-3.5 text-sm outline-none transition-all placeholder:opacity-40"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "var(--cream)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                />
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all duration-300"
                  style={{
                    background: "var(--cream)",
                    color: "var(--bark)",
                    opacity: status === "submitting" ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--wheat-light)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--cream)"; }}
                >
                  {status === "submitting" ? "..." : "Notify Me"}
                </button>
              </form>
            )}
            {status === "error" && (
              <p
                className="text-sm mt-3"
                style={{ color: "var(--terra-light)" }}
              >
                Something went wrong. Please try again.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
