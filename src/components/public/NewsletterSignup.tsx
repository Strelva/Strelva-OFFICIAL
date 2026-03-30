"use client";

import { useState } from "react";
import { useReveal } from "@/hooks/useReveal";

export function NewsletterSignup() {
  const sectionRef = useReveal();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <section
      id="newsletter"
      className="py-14 md:py-20"
      style={{ background: "var(--cream-dark)" }}
    >
      <div className="container-main">
        <div ref={sectionRef} className="reveal max-w-xl mx-auto text-center">
          <h2
            className="font-display text-3xl md:text-4xl tracking-tight mb-3"
            style={{ color: "var(--bark)" }}
          >
            Stay in the loop.
          </h2>
          <p
            className="text-sm leading-relaxed mb-8"
            style={{ color: "var(--bark-light)" }}
          >
            Monthly updates on new services, events, and wellness tips — no spam, ever.
          </p>

          {status === "success" ? (
            <p
              className="text-sm font-medium py-3"
              style={{ color: "var(--sage)" }}
            >
              You&apos;re in! We&apos;ll keep you updated.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                className="flex-1 px-4 py-3 text-sm border-0 outline-none transition-shadow focus:ring-2"
                style={{
                  background: "var(--cream)",
                  color: "var(--bark)",
                  borderRadius: 0,
                  // @ts-expect-error CSS custom property for ring color
                  "--tw-ring-color": "var(--sage)",
                }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-6 py-3 text-sm font-medium tracking-wide uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  background: "var(--sage)",
                  color: "var(--cream)",
                }}
              >
                {status === "loading" ? "..." : "Subscribe"}
              </button>
            </form>
          )}

          {status === "error" && errorMsg && (
            <p
              className="text-xs mt-3"
              style={{ color: "#b54a4a" }}
            >
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
