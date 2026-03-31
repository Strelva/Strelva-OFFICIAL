"use client";

import { useReveal } from "@/hooks/useReveal";
import type { ContactContent } from "@/lib/types";

export function Contact({ contact }: { contact: ContactContent }) {
  const sectionRef = useReveal();

  return (
    <section
      id="contact"
      className="py-14 md:py-20"
      style={{ background: "var(--cream)" }}
    >
      <div className="container-main">
        <div ref={sectionRef} className="reveal">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            {/* Left */}
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4">
                Let&apos;s connect.
              </h2>
              <p
                className="text-base leading-relaxed max-w-sm mb-10"
                style={{ color: "var(--bark-light)" }}
              >
                Interested in our snacks, wholesale, or just want to say hey? We&apos;d love to hear from you.
              </p>

              {/* Email */}
              <a
                href={`mailto:${contact.email}`}
                className="group flex items-center gap-4 mb-6"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center transition-colors"
                  style={{ background: "var(--cream-dark)" }}
                >
                  <svg className="h-4 w-4" style={{ color: "var(--bark-faded)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span
                  className="text-sm font-medium group-hover:opacity-60 transition-opacity"
                  style={{ color: "var(--bark)" }}
                >
                  {contact.email}
                </span>
              </a>

              {/* Social */}
              <div className="flex gap-3">
                {[
                  { href: contact.instagramUrl, label: "Instagram", d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" },
                  { href: contact.facebookUrl, label: "Facebook", d: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
                ].filter((social) => social.href && social.href !== "#").map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    className="flex h-10 w-10 items-center justify-center transition-all hover:opacity-60"
                    style={{ background: "var(--cream-dark)", color: "var(--bark-faded)" }}
                    aria-label={social.label}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d={social.d} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Right — Location */}
            <div className="flex items-center justify-center lg:justify-end">
              <div
                className="p-10 md:p-14 max-w-sm w-full"
                style={{ background: "var(--cream-dark)" }}
              >
                <h3 className="font-display text-3xl md:text-4xl tracking-tight mb-4">
                  {contact.locationTitle.split("\n").map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--bark-light)" }}
                >
                  {contact.locationDescription}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
