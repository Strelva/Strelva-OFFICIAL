"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
import "@/lib/lenis";

export function NewsletterSignup() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    if (!section || !content) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const elements = content.querySelectorAll("[data-newsletter-animate]");
      gsap.from(elements, {
        opacity: 0,
        y: 20,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: {
          trigger: section,
          start: "top 85%",
          once: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

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
      setTimeout(() => setStatus("idle"), 8000);
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <section
      ref={sectionRef}
      id="newsletter"
      className="py-14 md:py-20"
      style={{ background: "var(--cream-dark)" }}
    >
      <div className="container-main">
        <div ref={contentRef} className="max-w-xl mx-auto text-center">
          <h2
            data-newsletter-animate
            className="font-display text-3xl md:text-4xl tracking-tight mb-3"
            style={{ color: "var(--bark)" }}
          >
            Stay in the loop.
          </h2>
          <p
            data-newsletter-animate
            className="text-sm leading-relaxed mb-8"
            style={{ color: "var(--bark-light)" }}
          >
            Monthly updates on new offerings, events, and tips — no spam, ever.
          </p>

          {status === "success" ? (
            <p
              className="text-sm font-medium py-3"
              style={{ color: "var(--sage)" }}
            >
              You&apos;re in! We&apos;ll keep you updated.
            </p>
          ) : (
            <form data-newsletter-animate onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
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
